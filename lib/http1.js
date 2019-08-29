/**
 * module http1
 * Copyright (c) [2019.08] BraveWang
 * This software is licensed under the MPL-2.0.
 * You can use this software according to the terms and conditions of the MPL-2.0.
 * See the MPL for more details:
 *     https://www.mozilla.org/en-US/MPL/2.0/
 */
'use strict';

const http = require('http');
const https = require('https');
const helper = require('./helper');
const fs = require('fs');
const url = require('url');

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
            routepath   : '/',
            param       : {},
            query       : {},
            body        : {},
            isUpload    : false,
            group       : '',
            rawBody     : '',
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
            service : null,
        };
        ctx.getFile = function(name, ind = 0) {
            if (ind < 0) {return ctx.files[name] || [];}
    
            if (ctx.files[name] === undefined) {return null;}
            
            if (ind >= ctx.files[name].length) {return null;}
    
            return ctx.files[name][ind];
        };
    
        ctx.res.setHeader = function (name, val) {
            ctx.response.setHeader(name, val);
        };
    
        ctx.res.status = function(stcode = null) {
            if (stcode === null) { return ctx.response.statusCode; }
            if(ctx.response) { ctx.response.statusCode = stcode; }
        };
        ctx.moveFile = helper.moveFile;
    
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
    onRequest (req, res) {
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
            
            if (req.method == 'GET' || req.method == 'OPTIONS') {
                req.on('data', data => { });
            }
            else if (req.method=='POST' || req.method=='PUT' || req.method=='DELETE')
            {
                var dataLength = 0;
                req.on('data', data => {
                    dataLength += data.length;
                    if (dataLength > self.config.bodyMaxSize) {
                        ctx.rawBody = '';
                        res.statusCode = 413;
                        res.end(`Body too large,limit:${self.config.bodyMaxSize/1000}Kb`);
                        req.destroy();
                        return ;
                    }
                    ctx.rawBody += data.toString('binary');
                });
            }
            req.on('end',() => {
                if (req.aborted || res.finished) { return; }
                return self.midware.run(ctx);
            });
        };

        return callback;
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
                var opts = {
                    key  : fs.readFileSync(this.config.key),
                    cert : fs.readFileSync(this.config.cert)
                };
                serv = https.createServer(opts, this.onRequest());
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
