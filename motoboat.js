/**
 * motoboat 2.0.1
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
const midmin = require('./middleware-min');
const router = require('./router');
const helper = require('./helper');
const context = require('./context');

/**
 * @param {object} options 初始化选项，参考值如下：
 * - ignoreSlash{bool} 忽略末尾的/，默认为true
 * - debug {bool} 调试模式，默认为false
 * - limit {number} 限制请求最大连接数，如果是daemon接口，则是limit*进程数。
 * - deny  {Array} IP字符串数组，表示要拒绝访问的IP。
 * - maxIPRequest {number} 单个IP单元时间内最大访问次数。
 * - peerTime {number} 单元时间，配合maxIPRequest，默认为1表示1秒钟清空一次。
 * - maxIPCache {number} 最大IP缓存个数，配合限制IP访问次数使用，默认为15000。
 * - whiteList {Array} 限制IP请求次数的白名单。
 * - timeout 超时。
 * - cert 启用HTTPS要使用的证书。
 * - key  启用HTTPS的密钥。
 * - globalLog {bool} 启用全局日志。
 * - bodyMaxSize {number} 表示POST/PUT提交表单的最大字节数，包括上传文件。
 * - maxFiles {number} 最大上传文件数量，超过则不处理。
 * - daemon {bool} 启用守护进程模式。
 * - pidFile {string} 保存Master进程PID的文件路径。
 * - logFile {string}
 * - errorLogFile {string}
 * - logType {string} 日志类型，支持stdio、file、ignore
 * - pageNotFound {string} 404页面数据
 * - cors {string} 允许跨域的域名，*表示所有
 * - optionsReturn {bool} 是否自动返回OPTIONS请求，默认为true。
 * - parseUpload {bool} 自动解析上传文件数据，默认为true。
 * - useMinMiddleware {bool} 使用最简中间件模式，这个模式不支持路由分组以及规则匹配。默认为false。
 */
var motoboat = function (options = {}) {
    if (!(this instanceof motoboat)) {return new motoboat(options); }

    this.config = {
        //此配置表示POST/PUT提交表单的最大字节数，也是上传文件的最大限制，
        body_max_size   : 8000000,
        //最大上传文件数量
        max_files       : 15,

        //开启守护进程，守护进程用于上线部署，要使用ants接口，run接口不支持
        daemon          : false,
        /*开启守护进程模式后，如果设置路径不为空字符串，则会把pid写入到此文件，可用于服务管理。*/
        pid_file        : '',
        log_file        : './access.log',
        error_log_file  : './error.log',

        /* 日志类型：
            stdio   标准输入输出，可用于调试
            ignore  没有
            file    文件，此时会使用log_file以及error_log_file 配置的文件路径
        */
        log_type        : 'ignore',

        //允许跨域的域名，支持 * 或 域名 或 域名 数组
        cors : null,
        //自动处理OPTIONS请求，用于处理所有路由的情况
        auto_options : false,

        /** 如果你要更完整的记录请求日志，则需要此选项。*/
        global_log : false,
        //自动解析上传的文件数据
        parse_upload    : true,
        //开启HTTPS
        https           : false,
        //HTTPS密钥和证书的路径
        key  : '',
        cert : '',
        //设置服务器超时，毫秒单位，在具体的请求中，可以通过stream设置具体请求的超时时间
        timeout : 20000,
        page_404 : 'page not found',
        show_load_info : true,
        debug : false,
        min_mid: false,
    };
    this.req_ip_table = {}; // 记录IP访问次数，用于一段时间内的单个IP访问次数限制。
    this.limit = {
        max_conn : 1024, //限制最大连接数，如果设置为0表示不限制
        deny_ip: [], //拒绝请求的IP。
        per_ip_max_req: 0, //每秒单个IP可以进行请求次数的上限，0表示不限制。
        peer_time: 1, //IP访问次数限制的时间单元，1表示每隔1秒钟检测一次。
        max_ip_cache: 15000, //存储IP最大个数，是req_ip_table的上限，否则于性能有损。
        white_list: [], //限制IP请求次数的白名单。
    };
    if (typeof options == 'object') {
        for(var k in options) {
            switch (k) {
                case 'limit':
                  if (typeof options.limit=='number' && parseInt(options.limit) >= 0){
                    this.limit.max_conn = options.limit;
                  }
                  break;
                case 'deny':
                  this.limit.deny_ip = options.deny; break;
                case 'maxIPRequest':
                  if (parseInt(options.maxIPRequest) >= 0) {
                    this.limit.per_ip_max_req = parseInt(options.maxIPRequest);
                  }
                  break;
                case 'peerTime':
                  if (parseInt(options.peerTime) > 0) {
                      this.limit.peer_time = parseInt(options.peerTime);
                  }
                  break;
                case 'maxIPCache':
                  if (parseInt(options.maxIPCache) >= 1024) {
                      this.limit.max_ip_cache = parseInt(options.maxIPCache);
                  }break;
                case 'showLoadInfo':
                  this.config.show_load_info = options.showLoadInfo; break;
                case 'whiteList':
                  this.limit.white_list = options.whiteList; break;
                case 'debug':
                  this.config.debug = options.debug; break;
                case 'timeout':
                  this.config.timeout = options.timeout; break;
                case 'logType':
                  this.config.log_type = options.logType; break;
                case 'daemon':
                  this.config.daemon = options.daemon; break;
                case 'maxFiles':
                  this.config.max_files = options.maxFiles; break;
                case 'globalLog':
                  this.config.global_log = options.globalLog; break;
                case 'bodyMaxSize':
                  this.config.body_max_size = options.bodyMaxSize; break;
                case 'pageNotFound':
                  this.config.page_404 = options.pageNotFound; break;
                case 'cors':
                  this.config.cors = options.cors; break;
                case 'optionsReturn':
                  this.config.auto_options = options.optionsReturn; break;
                case 'parseUpload':
                  this.config.parse_upload = options.parseUpload; break;
                case 'useMinMiddleware':
                  this.config.min_mid = options.useMinMiddleware; break;
                default:;
            }
        }

        if (options.key && options.cert) {
            try {
                fs.accessSync(options.cert, fs.constants.F_OK);
                fs.accessSync(options.cert, fs.constants.F_OK);
                this.config.cert = options.cert;
                this.config.key = options.key;
                this.config.https = true;
            } catch (err) {
                console.log(err);
            }
        }
        if (options.logFile) {
            this.config.log_file = options.logFile;
        }
        if (options.errorLogFile) {
            this.config.error_log_file = options.errorLogFile;
        }
    }
    /** 记录当前的运行情况 */
    this.rundata = {
        //当前连接数
        cur_conn : 0,
        platform : os.platform()
    };
    //用于匹配content-type确定是不是上传文件。
    this.pregUpload = /multipart.* boundary.*=/i;
    this.helper = helper;
    this.parseUploadData = bodyParser.parseUploadData;
    this.parseSingleFile = bodyParser.parseSingleFile;
    
    this.router = router(options);
    this.methodList = this.router.methodList;

    if (!this.config.min_mid) {
        this.middleware = middleware(options);
        this.add = function (midcall, options = {}) {
            return this.middleware.add(midcall, this.router.apiGroupTable, options);
        };
        this.addFinalResponse = function () {
            return this.middleware.addFinalResponse(this.router.apiGroupTable);
        };
        this.use = this.middleware.addCache;
    } else {
        this.middleware = midmin(options);
        this.add = this.middleware.add;
        this.addFinalResponse = this.middleware.addFinalResponse;
        this.use = this.middleware.addCache;
    }
    this.runMiddleware = this.middleware.runMiddleware;

    this.context = context;
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
            ctx.body = qs.parse(Buffer.from(ctx.rawBody, 'binary').toString('utf8'));
        } else {
            ctx.body = Buffer.from(ctx.rawBody, 'binary').toString('utf8');
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
motoboat.prototype.sendReqLog = function (headers, method, rinfo) {
    var log_data = {
        type    : 'log',
        success : true,
        method  : method,
        link    : `${this.config.https?'https://':'http://'}${headers['host']}${rinfo.path}`,
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
};

/** 限制IP请求次数的定时器。*/
motoboat.prototype.limitIPConnListen = function () {
    var the = this;
    setInterval(() => {
        the.req_ip_table = {};
    }, the.limit.peer_time * 1000);
};

/**
 * 请求过滤函数。
 * @param {object} the 其实就是this。
 * @param {object} sock 当前请求的socket实例。
 */
motoboat.prototype.connFilter = function(sock) {
    var the = this;
    //检测是否在拒绝IP列表中。
    if (the.limit.deny_ip.length > 0 
        && the.limit.deny_ip.indexOf(sock.remoteAddress)>=0
    ) {
        sock.destroy();
        return ;
    }
    
    the.rundata.cur_conn += 1;
    sock.on('close', () => {
        the.rundata.cur_conn -= 1;
    });

    //检测是否超过最大连接数限制。
    if (the.limit.max_conn > 0 
        && the.rundata.cur_conn > the.limit.max_conn
    ) {
        sock.destroy();
        if (the.config.debug) {console.log(the.rundata.cur_conn,'closed');}
        return ;
    }

    //如果开启了单元时间内单个IP最大访问次数限制则检测是否合法。
    var remote_ip = sock.remoteAddress;
    if (the.limit.per_ip_max_req > 0 && the.limit.white_list.indexOf(remote_ip) < 0) {
        if (the.req_ip_table[remote_ip] !== undefined) {
            if (the.req_ip_table[remote_ip] >= the.limit.per_ip_max_req) {
                sock.destroy();
                return ;
            } else {
                the.req_ip_table[remote_ip] += 1;
            }
        } else if (Object.keys(the.req_ip_table).length >= the.limit.max_ip_cache) {
            /** 
             * 如果已经超过IP最大缓存数量限制则关闭连接，这种情况在极端情况下会出现。
             * 不过最大缓存数量不能低于最大连接数。否则并发支持会受限制。
             * */
            sock.destroy();
            return ;
        } else {
            the.req_ip_table[remote_ip] = 1;
        }
    }
};

/**
 * request事件的回调函数。
 * @param {req} http.IncomingMessage
 * @param {res} http.ServerResponse
 */
motoboat.prototype.onRequest = function (req, res) {
    var the = this;
    //request事件回调函数，此函数打包了比较多的处理，但是没有分离出更多的函数。
    //如果路由不存在或方法不支持，会直接返回错误而不会继续创建请求上下文的过程。
    var callback = (req, res) => {
        req.on('abort', (err) => {res.statusCode = 400; res.end();});
        req.on('error', (err) => {
            req.abort();
            res.statusCode = 400;
            res.end();
        });

        var remote_ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
        if (the.config.global_log && cluster.isWorker) {
            res.on('finish', () => {
                the.sendReqLog(req.headers, req.method, {
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

        var real_path = the.router.findRealPath(urlobj.pathname, req.method);
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
        ctx.ip = remote_ip;
        ctx.request = req;
        ctx.response = res;
        ctx.headers = req.headers;
        ctx.path = urlobj.pathname;
        ctx.query = urlobj.query;
        the.router.setContext(real_path, ctx);
        
        if (req.method == 'GET' || req.method == 'OPTIONS') {
            req.on('data', data => {
                res.statusCode = 400;
                res.end('bad request');
                req.abort();
            });
            //检测是否为全局返回OPTIONS请求。
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
            var dataLength = 0;
            req.on('data', data => {
                dataLength += data.length;
                if (dataLength > the.config.body_max_size) {
                    ctx.rawBody = '';
                    res.statusCode = 413;
                    res.end(`Body too large,limit:${the.config.body_max_size/1000}Kb`);
                    req.destroy(new Error(`body too large`));
                    return ;
                }
                ctx.rawBody += data.toString('binary');
            });
        }
        req.on('end',() => {
            if (req.aborted || res.finished) { return; }
            return the.execRequest(ctx);
        });
    };

    return callback;
};

/**
 * 开始监听请求，此函数根据配置等信息做处理后调用listen
 * @param {number} port 端口
 * @param {string} host IP地址
 */
motoboat.prototype.run = function(port = 8192, host = '0.0.0.0') {
    if (this.limit.per_ip_max_req > 0) {
        this.limitIPConnListen();
    }
    this.middleware.addFromCache(this.router.apiGroupTable);
    this.addFinalResponse();
    var the = this;
    var serv = null;

    if (this.config.https) {
        try {
            var opts = {
                key  : fs.readFileSync(this.config.key),
                cert : fs.readFileSync(this.config.cert)
            };
            serv = https.createServer(opts, this.onRequest());
            serv.on('tlsClientError', (err) => {
                if (the.config.debug) { console.log('--DEBUG-TLS-ERROR:', err); }
            });
        } catch(err) {
            console.log(err);
            process.exit(-1);
        }
    } else {
        serv = http.createServer(this.onRequest());
    }

    serv.on('clientError', (err, sock) => {sock.end("Bad Request");});
    serv.on('connection', (sock) => { return the.connFilter(sock); });
    serv.setTimeout(this.config.timeout);
    serv.listen(port, host);

    return serv;
};

/** 负载情况 */
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
        if (!this.config.daemon) { console.clear(); }

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
        cols += `  Listen ${this.loadInfo[0].host}:${this.loadInfo[0].port}\n`;
        if (this.config.daemon) {
            try {
                fs.writeFileSync('./load-info.log', oscpu+cols, {encoding:'utf8'});
            } catch (err) { }
        } else {
            console.log(oscpu+cols);
        }
        this.loadInfo = [w];
    } else {
        this.loadInfo.push(w);
    }
};
/** 
 * 监听消息事件，Master进程调用。
*/
motoboat.prototype.daemonMessage = function () {
    var the = this;
    var logger = null;
    if (the.config.log_type == 'file') {
        var out_log = fs.createWriteStream(the.config.log_file, {flags: 'a+'});
        var err_log = fs.createWriteStream(the.config.error_log_file, {flags: 'a+'});

        logger = new console.Console({stdout:out_log, stderr: err_log}); 
    } else if (the.config.log_type == 'stdio') {
        var opts = {stdout:process.stdout, stderr: process.stderr};
        logger = new console.Console(opts);
    }

    cluster.on('message', (worker, msg, handle) => {
        try {
            switch(msg.type) {
                case 'log':
                    msg.success 
                    ? logger.log(JSON.stringify(msg)) 
                    : logger.error(JSON.stringify(msg));
                    break;
                case 'load':
                    the.showLoadInfo(msg); break;
                default:;
            }
        } catch (err) { if (the.config.debug) {console.log(err);} }
    });
};
/**
 * 这个函数是可以用于运维部署，此函数默认会根据CPU核数创建对应的子进程处理请求。
 * @param {number} port 端口号
 * @param {string} host IP地址
 * @param {number} num 子进程数量，默认为0，默认根据CPU核数创建子进程。
 */
motoboat.prototype.daemon = function(port=8192, host='0.0.0.0', num = 0) {

    if (typeof host === 'number') {num = host; host = '0.0.0.0'; }
    var the = this;

    if (process.argv.indexOf('--daemon') > 0) {
    } else if (the.config.daemon) {
        var args = process.argv.slice(1);
        args.push('--daemon');
        const serv = spawn (
                process.argv[0], args,
                {detached: true, stdio: ['ignore', 1, 2]}
            );
        serv.unref();
        return true;
    }
    
    if (cluster.isMaster) {
        if (num <= 0) { num = os.cpus().length; }

        if (typeof the.config.pid_file === 'string'
            && the.config.pid_file.length > 0) {

            fs.writeFile(the.config.pid_file, process.pid, (err) => {
                if (err) {console.error(err);}
            });
        }
        this.daemonMessage();

        for(var i=0; i<num; i++) { cluster.fork(); }

        if (cluster.isMaster) {
            setInterval(() => {
                var num_dis = num - Object.keys(cluster.workers).length;
                for(var i=0; i<num_dis; i++) { cluster.fork(); }
            }, 2000);
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
                    conn : the.rundata.cur_conn,
                    host : host,
                    port : port
                });
                cpuLast = process.cpuUsage();
            }, 1280);
        }
    }
};

module.exports = motoboat;

/**
 * 一些你可能想要知道的：
 * 跨域资源共享标准新增了一组HTTP首部字段，允许服务器声明哪些源站通过浏览器有权限访问哪些资源。
 * 并且规范要求，对那些可能会对服务器资源产生改变的请求方法，
 * 需要先发送OPTIONS请求获取是否允许跨域以及允许的方法。
 * 因此，为了更方便的处理，添加了全局处理OPTIONS请求的过程。
 * 
*/
