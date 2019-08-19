/**
 * motoboat 1.5.2
 * Copyright (c) [2019.08] BraveWang
 * This software is licensed under the MPL-2.0.
 * You can use this software according to the terms and conditions of the MPL-2.0.
 * See the MPL for more details:
 *     https://www.mozilla.org/en-US/MPL/2.0/
 */
'use strict';

const fs = require('fs');
const qs = require('querystring');
const http = require('http');
const https = require('https');
const url = require('url');
const cluster = require('cluster');
const os = require('os');
const {spawn} = require('child_process');
//const util = require('util');
//const crypto = require('crypto');
const bodyParser = require('./bodyparser');
const middleware = require('./middleware');
const router = require('./router');
const helper = require('./helper');

/**
 * 
 * @param {object} options 初始化选项，参考值如下：
 * - ignoreSlash，忽略末尾的/，默认为true
 * - debug 调试模式，默认为true
 * - limit 限制请求最大连接数，如果是daemon接口，则是limit*进程数。
 */
var motoboat = function (options = {}) {
    if (!(this instanceof motoboat)) {return new motoboat(); }
    //var the = this;

    this.config = {
        //此配置表示POST/PUT提交表单的最大字节数，也是上传文件的最大限制，
        body_max_size   : 8000000,

        //最大上传文件数量
        max_files       : 15,

        //开启守护进程，守护进程用于上线部署，要使用ants接口，run接口不支持
        daemon          : false,

        /*
            开启守护进程模式后，如果设置路径不为空字符串，
            则会把pid写入到此文件，可用于服务管理。
        */
        pid_file        : '',

        log_file        : './access.log',

        error_log_file  : './error.log',

        /*
            日志类型：
                stdio   标准输入输出，可用于调试
                ignore  没有
                file    文件，此时会使用log_file以及error_log_file 配置的文件路径
        */
        log_type        : 'ignore',

        //允许跨域的域名，支持 * 或 域名 或 域名 数组
        cors : null,

        //自动处理OPTIONS请求，用于处理所有路由的情况
        auto_options : false,

        /**
         * 如果你要更完整的记录请求日志，则需要此选项。
         */
        global_log : false,

        //自动解析上传的文件数据
        parse_upload    : true,

        //开启HTTPS
        https_on        : false,

        //HTTPS密钥和证书的路径
        key  : '',
        cert : '',

        //设置服务器超时，毫秒单位，在具体的请求中，可以通过stream设置具体请求的超时时间
        timeout : 20000,

        page_404 : 'page not found',

        show_load_info : true,

        debug : true,
    };

    if (options.debug !== undefined) {
        this.config.debug = options.debug;
    }

    this.limit = {
        /**
         * 限制最大连接数，如果设置为0表示不限制
         */
        max_conn : 1024,
    };
    if (options.limit !== undefined && typeof options.limit === 'number') {
        if (parseInt(options.limit) >= 0) {
            this.limit.max_conn = options.limit;
        }
    }

    /**
     * 记录当前的运行情况
     */
    this.rundata = {
        //当前连接数
        cur_conn : 0,
        platform : os.platform()
    };

    //用于匹配content-type确定是不是上传文件。
    this.pregUpload = /multipart.* boundary.*=/i;

    this.methodList = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
    this.helper = helper;
    this.parseUploadData = bodyParser.parseUploadData;
    this.parseSingleFile = bodyParser.parseSingleFile;
    
    this.middleware = middleware(options);
    this.add = this.middleware.add;
    this.runMiddleware = this.middleware.runMiddleware;
    this.addFinalResponse = this.middleware.addFinalResponse;

    this.router = router(options);
    this.group = this.router.group;

};

motoboat.prototype.context = function () {
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
        args        : {},
        param       : {},
        bodyparam   : {},
        isUpload    : false,
        group       : '',
        rawBody     : '',
        files       : {},
        requestCall : null,
        extName     : this.helper.extName,
        genFileName : this.helper.genFileName,

        request     : null,
        response    : null,

        res         : {
            statusCode : 200,
            data : '',
            encoding : 'utf8'
        },

        keys : {},
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

    ctx.res.write = function(data) {
        if (typeof data === 'string') {
            ctx.res.data += data;
        } else if (data instanceof Buffer) {
            ctx.res.data += data.toString(ctx.res.encoding);
        } else if (typeof data === 'number') {
            ctx.res.data += data.toString();
        }
    };

    ctx.res.status = function(stcode) {
        if(ctx.response && ctx.response.statusCode) {
            ctx.response.statusCode = stcode;
            ctx.res.statusCode = stcode;
        }
    };

    ctx.moveFile = this.helper.moveFile;
    return ctx;
};

/**
 * 执行请求的包装方法，会根据请求上下文信息查找路由表，确定是否可执行。
 * 如果是上传文件，并且开启了自动解析选项，则会解析文件数据。
 * 最后会调用runMiddleware方法。
 * @param {object} ctx 请求上下文实例。
 */
motoboat.prototype.execRequest = function (ctx) {
    if ((ctx.method == 'POST' || ctx.method == 'PUT' || ctx.method == 'DELETE') 
        && !ctx.isUpload && ctx.rawBody.length > 0
    ) {
        if (ctx.headers['content-type'] && 
            ctx.headers['content-type'].indexOf('application/x-www-form-urlencoded') >= 0
        ) {
            ctx.bodyparam = qs.parse(
                    Buffer.from(ctx.rawBody, 'binary').toString('utf8')
                );
        } else {
            ctx.bodyparam = Buffer
                            .from(ctx.rawBody, 'binary')
                            .toString('utf8');
        }
    }
    else if (ctx.isUpload && this.config.parse_upload) {
        this.parseUploadData(ctx, this.config.max_files);
    }
    
    return this.runMiddleware(ctx);
};

/*
    multipart/form-data
    multipart/byteranges不支持
*/
motoboat.prototype.checkUploadHeader = function(headerstr) {
    if (this.pregUpload.test(headerstr)) {
        return true;
    }
    return false;
};

/**
 * 发送日志消息，此函数只能在worker进程中调用。
 * @param {object} headers
 * @param {object} rinfo
 */
motoboat.prototype.sendReqLog = function (headers, rinfo) {
    var log_data = {
        type    : 'log',
        success : true,
        method  : headers.method,
        link    : `${this.config.https_on?'https://':'http://'}${headers['host']}${rinfo.path}`,
        time    : (new Date()).toLocaleString("zh-Hans-CN"),
        status  : rinfo.status,
        ip      : rinfo.ip
    };
    if (headers['x-real-ip']) {
        log_data.ip = headers['x-real-ip'];
    }

    if (log_data.status != 200) {
        log_data.success = false;
    }
    if (process.send && typeof process.send === 'function') {
        process.send(log_data);
    }
};

/**
 * 开始监听请求，此函数根据配置等信息做处理后调用listen
 * @param {number} port 端口
 * @param {string} host IP地址
 */
motoboat.prototype.run = function(port = 8192, host = '0.0.0.0') {
    this.addFinalResponse();
    var the = this;
    var onRequest = (req, res) => {
        req.on('abort', (err) => {res.statusCode = 400; res.end();});
        req.on('error', (err) => {
            req.abort();
            res.statusCode = 400;
            res.end();
        });

        var remote_ip = req.socket.remoteAddress;
        if (the.config.global_log && cluster.isWorker) {
            res.on('finish', () => {
                the.sendReqLog(req.headers, {
                    status : res.statusCode,
                    ip : remote_ip,
                    path : req.url
                });
            });
        }

        if (the.methodList.indexOf(req.method) < 0) {
            res.statusCode = 405;
            res.setHeader('Allow', the.methodList);
            res.end('Method not allowed');
            return ;
        }

        var urlobj = url.parse(req.url, true);
        if (urlobj.pathname == '') { urlobj.pathname = '/'; }

        var real_path = '';
        real_path = the.router.findRealPath(urlobj.pathname, req.method);
        if (real_path === null) {
            res.statusCode = 404;
            res.end(the.config.page_404);
            return ;
        }

        var ctx = the.context();
        ctx.method = req.method;
        ctx.url.host = req.headers['host'];
        ctx.url.protocol = urlobj.protocol;
        ctx.url.href = urlobj.href;
        ctx.url.origin = urlobj.origin;

        ctx.request = req;
        ctx.response = res;
        ctx.headers = req.headers;
        ctx.path = urlobj.pathname;
        //ctx.routepath = real_path.key; ctx.args = real_path.args;
        ctx.param = urlobj.query;
        the.router.setContext(real_path, ctx);
        /*
         跨域资源共享标准新增了一组HTTP首部字段，允许服务器声明哪些源站通过浏览器有权限访问哪些资源。
         并且规范要求，对那些可能会对服务器资源产生改变的请求方法，
         需要先发送OPTIONS请求获取是否允许跨域以及允许的方法。
        */
        if (req.method == 'GET' || req.method == 'OPTIONS') {
            req.on('data', data => {
                res.statusCode = 400;
                res.end('bad request');
                req.abort();
            });
            if (req.method == 'OPTIONS') {
                res.setHeader('Access-control-allow-methods', the.methodList);
                if (the.config.cors) {
                    res.setHeader('Access-control-allow-origin', the.config.cors);
                }
                if (the.config.auto_options) {
                    res.statusCode = 200;
                    res.end();
                    return ;
                }
            }
        }
        else if (req.method=='POST' || req.method=='PUT' || req.method=='DELETE')
        {
            ctx.isUpload = the.checkUploadHeader(req.headers['content-type']);
            req.on('data', data => {
                ctx.rawBody += data.toString('binary');
                if (ctx.rawBody.length > the.config.body_max_size) {
                    ctx.rawBody = '';
                    res.statusCode = 413;
                    res.end(`Body too large,limit:${the.config.body_max_size/1000}Kb`);
                    req.destroy(new Error('body data too large'));
                }
            }); 
        }
        req.on('end',() => {
            if (req.aborted) { return; }
            return the.execRequest(ctx);
        });
    };

    var opts = {};
    var serv = null;
    if (the.config.https_on) {
        try {
            opts = {
                key  : fs.readFileSync(the.config.key),
                cert : fs.readFileSync(the.config.cert)
            };
            serv = https.createServer(opts, onRequest);
            serv.on('tlsClientError', (err) => {});
        } catch(err) {
            console.log(err);
            process.exit(-1);
        }
    } else {
        serv = http.createServer(onRequest);
    }

    serv.on('clientError', (err, sock) => {sock.end("Bad Request");});
    //限制连接数量
    serv.on('connection', (sock) => {
        the.rundata.cur_conn += 1;
        if (the.limit.max_conn > 0 
            && the.rundata.cur_conn > the.limit.max_conn
        ) {
            sock.destroy();
            if (the.config.debug) {console.log(the.rundata.cur_conn,'closed');}
        }
        sock.on('close', () => { the.rundata.cur_conn -= 1; });
    });

    serv.setTimeout(the.config.timeout);
    serv.listen(port, host);
    return serv;
};

/**
 * 负载情况
 */
motoboat.prototype.loadInfo = [];

/**
 * 通过loadInfo计算并输出负载情况，这个函数要在Master进程中调用，否则会报错。
 * @param {object} w 子进程发送的负载情况。
 */
motoboat.prototype.showLoadInfo = function (w) {
    var total = Object.keys(cluster.workers).length;
    if (this.loadInfo.length == total) {
        this.loadInfo.sort((a, b) => {
            if (a.pid < b.pid) {
                return -1;
            } else if (a.pid > b.pid) {
                return 1;
            }
            return 0;
        });
        if (!this.config.daemon) {
            console.clear();
        }
        var oavg = os.loadavg();

        var oscpu = `  CPU Loadavg  1m: ${oavg[0].toFixed(2)}  5m: ${oavg[1].toFixed(2)}  15m: ${oavg[2].toFixed(2)}\n`;

        var cols = '  PID       CPU       MEM       CONN\n';
        var tmp = '';
        var t = '';
        for(let i=0; i<this.loadInfo.length; i++) {
            tmp = (this.loadInfo[i].pid).toString() + '          ';
            tmp = tmp.substring(0, 10);
            t = this.loadInfo[i].cpu.user + this.loadInfo[i].cpu.system;
            t = (t/12800).toFixed(2);
            tmp += t + '%       ';
            tmp = tmp.substring(0, 20);
            tmp += (this.loadInfo[i].mem.rss / (1024*1024)).toFixed(2);
            tmp += 'M         ';
            tmp = tmp.substring(0, 30);
            tmp += this.loadInfo[i].conn.toString();
            cols += `  ${tmp}\n`;
        }
        cols += `  Master PID: ${process.pid}\n`;
        if (this.config.daemon) {
            try {
                fs.writeFileSync('./load-info.log',
                    oscpu+cols, {encoding:'utf8'}
                );
            } catch (err) {}
        } else {
            console.log(oscpu+cols);
        }
        this.loadInfo = [w];
    } else {
        this.loadInfo.push(w);
    }
};

/**
 * 这个函数是可以用于运维部署，此函数默认会根据CPU核数创建对应的子进程处理请求。
 * @param {number} port 端口号
 * @param {string} host IP地址
 * @param {number} num 子进程数量，默认为0，默认根据CPU核数创建子进程。
 */
motoboat.prototype.daemon = function(port=8192, host='0.0.0.0', num = 0) {
    var the = this;
    if (process.argv.indexOf('--daemon') > 0) {
    } else if (the.config.daemon) {
        var args = process.argv.slice(1);
        args.push('--daemon');
        const serv = spawn (
                process.argv[0],
                args,
                {detached: true, stdio: ['ignore', 1, 2]}
            );
        serv.unref();
        return true;
    }
    
    if (cluster.isMaster) {
        if (num <= 0) {num = os.cpus().length;}

        if (typeof the.config.pid_file === 'string'
            && the.config.pid_file.length > 0
        ) {
            fs.writeFile(the.config.pid_file, process.pid, (err) => {
                if (err) {console.error(err);}
            });
        }

        for(var i=0; i<num; i++) {
            cluster.fork();
        }

        if (cluster.isMaster) {
            var logger = null;
            if (the.config.log_type == 'file') {
                var out_log = fs.createWriteStream(
                    the.config.log_file, {flags : 'a+' }
                );
                var err_log = fs.createWriteStream(
                    the.config.error_log_file, {flags : 'a+' }
                );
                logger = new console.Console({stdout:out_log, stderr: err_log}); 
            } else if (the.config.log_type == 'stdio') {
                logger = new console.Console();
            }
            /*
             检测子进程数量，如果有子进程退出则fork出差值的子进程，维持在一个恒定的值。
            */
            setInterval(() => {
                var num_dis = num - Object.keys(cluster.workers).length;
                for(var i=0; i<num_dis; i++) {
                    cluster.fork();
                }
            }, 2000);

            cluster.on('message', (worker, message, handle) => {
                try {
                    if(message.type == 'log' && message.success) {
                        logger.log(JSON.stringify(message));
                    } else if (message.type == 'log' && !message.success) {
                        logger.error(JSON.stringify(message));
                    }

                    if (message.type == 'load') {
                        the.showLoadInfo(message);
                    }
                } catch (err) {}
            });
        }
    } else if (cluster.isWorker) {
        this.run(port, host);
        if (the.config.show_load_info) {
            var cpuLast = {user: 0, system: 0};
            var cpuTime = {};
            setInterval(() => {
                cpuTime = process.cpuUsage(cpuLast);
                process.send({
                    type : 'load',
                    pid  : process.pid,
                    cpu  : cpuTime,
                    mem  : process.memoryUsage(),
                    conn : the.rundata.cur_conn
                });
                cpuLast = process.cpuUsage();
            }, 1280);
        }
    }
};

module.exports = motoboat;
