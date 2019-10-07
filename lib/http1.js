/**
    module http1
    Copyright (C) 2019.08 BraveWang
    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation; either version 3 of the License , or
    (at your option) any later version.
 */

'use strict';

const http = require('http');
const https = require('https');
const helper = require('./helper');
const url = require('url');
const fs = require('fs');

class http1 {
    constructor (options = {}) {
        this.config = options.config;
        this.router = options.router;
        this.midware = options.midware;
        this.events = options.events;
        this.service = options.service;
    }

    /**
     * 生成请求上下文对象
     */
    context () {
        var ctx = {
            config      : {},
            bodyMaxSize : 0,
            method      : '',
            url         : {
                host        : '',
                protocol    : '',
                href        : '',
                origin      : '',
                port        : '',
            },
            ip          : '',
            //实际的访问路径
            path        : '',
            name        : '',
            headers     : {},
            //实际执行请求的路径
            routepath   : '',
            param       : {},
            query       : {},
            body        : {},
            isUpload    : false,
            group       : '',
            rawBody     : '',
            bodyBuffer  : [],
            bodyLength  : 0,
            files       : {},
            requestCall : null,
            helper      : helper,
    
            request     : null,
            response    : null,
    
            res         : {
                statusCode  : 200,
                body        : '',
                encoding    : 'utf8'
            },
    
            box : {},
            routerObj: null,
            service:null,
        };
        ctx.getFile = function(name, ind = 0) {
            if (ind < 0) {return ctx.files[name] || [];}
    
            if (ctx.files[name] === undefined) {return null;}
            
            if (ind >= ctx.files[name].length) {return null;}
    
            return ctx.files[name][ind];
        };
    
        ctx.setHeader = function (name, val) {
            ctx.response.setHeader(name, val);
        };
    
        ctx.status = function(stcode = null) {
            if (stcode === null) { return ctx.response.statusCode; }
            if(ctx.response) { ctx.response.statusCode = stcode; }
        };

        ctx.moveFile = async function (upf, options) {
            return helper.moveFile(ctx, upf, options);
        };
    
        return ctx;
    }

    /**
     * 
     * @param {string} method 
     * @param {object} rinfo 
     */
    globalLog (method, rinfo) {
        var log_data = {
            type    : 'log',
            success : true,
            method  : method,
            link    : rinfo.link,
            time    : (new Date()).toLocaleString("zh-Hans-CN"),
            status  : rinfo.status,
            ip      : rinfo.ip
        };
    
        if (log_data.status != 200) {
            log_data.success = false;
        }
        if (process.send && typeof process.send === 'function') {
            process.send(log_data);
        }
    }

    /**
     * request事件的回调函数。
     * @param {req} http.IncomingMessage
     * @param {res} http.ServerResponse
     */
    onRequest () {
        var self = this;

        var callback = (req, res) => {
            req.on('abort', (err) => {res.statusCode = 400; res.end();});
            req.on('error', (err) => {
                res.statusCode = 400;
                res.end();
                req.abort();
            });

            var remote_ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
            if (self.config.globalLog) {
                res.on('finish', () => {
                    self.globalLog(req.method, {
                        status : res.statusCode,
                        ip : remote_ip,
                        link: `${self.config.https?'https:':'http:'}//${req.headers['host']}${req.url}`
                    });
                });
            }

            var urlobj = url.parse(req.url, true);
            if (urlobj.pathname == '') { urlobj.pathname = '/'; }

            var findRouter = self.router.findRealPath(urlobj.pathname, req.method);
            if (findRouter === null) {
                res.statusCode = 404;
                res.end(self.config.pageNotFound);
                return ;
            }

            var ctx = self.context();
            ctx.bodyLength = 0;
            ctx.config = self.config;
            ctx.bodyMaxSize = self.config.bodyMaxSize;
            ctx.service = self.service;
            ctx.method = req.method;
            ctx.url.host = req.headers['host'];
            ctx.url.protocol = urlobj.protocol;
            ctx.url.href = urlobj.href;
            ctx.ip = remote_ip;
            ctx.request = req;
            ctx.response = res;
            ctx.headers = req.headers;
            ctx.path = urlobj.pathname;
            ctx.query = urlobj.query;
            ctx.routerObj = findRouter;
            self.router.setContext(ctx);
            return self.midware.run(ctx);
        };

        return callback;
    }

    async requestMidware (ctx, next) {
        await new Promise((rv, rj) => {
            if (ctx.method == 'GET' 
                || ctx.method == 'OPTIONS'
                || ctx.method == 'HEAD'
                || ctx.method == 'TRACE')
            {
                ctx.request.on('data', data => {
                    ctx.response.statusCode = 400;
                    ctx.response.end();
                    ctx.request.destroy();
                });
            }
            else if (ctx.method=='POST'
                || ctx.method=='PUT'
                || ctx.method=='DELETE'
                || ctx.method == 'PATCH')
            {
                ctx.request.on('data', data => {
                    ctx.bodyLength += data.length;
                    if (ctx.bodyLength > ctx.bodyMaxSize) {
                        ctx.bodyBuffer = null;
                        ctx.response.statusCode = 413;
                        ctx.response.end(
                            `Body too large,limit:${ctx.bodyMaxSize/1000}Kb`
                        );
                        ctx.request.destroy();
                        return ;
                    }
                    ctx.bodyBuffer.push(data);
                });
            }

            ctx.request.on('end',() => {
                if (ctx.request.aborted || ctx.response.finished) { 
                    rj();
                } else {
                    rv();
                }
            });
        })
        .then(async () => {
            if (ctx.bodyBuffer.length > 0) {
                ctx.rawBody = Buffer.concat(ctx.bodyBuffer, ctx.bodyLength);
                ctx.bodyBuffer = [];
            }
            await next(ctx);
        }, err => {})
        .finally(() => {
            ctx.bodyBuffer = [];
        });

    }

    /** 
     * 运行HTTP/1.1服务
     * @param {number} port 端口号
     * @param {string} host IP地址，可以是IPv4或IPv6
     * 0.0.0.0 对应使用IPv6则是::
    */
    run (port, host) {
        var self = this;
        var serv = null;

        if (this.config.https) {
            try {
                this.config.server.cert = fs.readFileSync(this.config.cert);
                this.config.server.key = fs.readFileSync(this.config.key);
                
                serv = https.createServer(this.config.server, this.onRequest());
                serv.on('tlsClientError', (err) => {
                    if (self.config.debug) { console.log('--DEBUG-TLS-ERROR:', err); }
                });
            } catch(err) {
                console.log(err);
                process.exit(-1);
            }
        } else {
            serv = http.createServer(this.onRequest());
        }

        serv.on('clientError', (err, sock) => {sock.end("Bad Request");});
        
        serv.setTimeout(this.config.timeout);
        
        for(let k in this.events) {
            if (typeof this.events[k] !== 'function') { continue; }
            if (k=='tlsClientError') { continue; }
            serv.on(k, this.events[k]);
        }

        serv.listen(port, host);

        return serv;
    }

}

module.exports = http1;
