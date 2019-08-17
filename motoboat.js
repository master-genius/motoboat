/**
 * motoboat 1.4.2
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
const crypto = require('crypto');
const cluster = require('cluster');
const os = require('os');
const {spawn, exec} = require('child_process');
const util = require('util');

var motoboat = function () {
    if (!(this instanceof motoboat)) {return new motoboat(); }
    var the = this;
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

        //路径最后的/有没有都认为是同一路径，设置true则会在添加路径的时候去掉末尾的/
        ignore_slash : true,

        page_404 : 'page not found',

        debug : true,

        show_load_info : true,
    };

    this.limit = {
        /**
         * 限制最大连接数，如果设置为0表示不限制
         */
        max_conn : 1024,
    };

    /**
     * 记录当前的运行情况
     */
    this.rundata = {
        //当前连接数
        cur_conn : 0,

        platform : ''
    };
    this.rundata.platform = os.platform();

    this.helper = {};

    /**
     * @param {string} filename 文件名称
     */
    this.helper.extName = function (filename) {
        if (filename.indexOf(".") < 0) {
            return '';
        }
        var name_slice = filename.split('.');
        if (name_slice.length <= 0) {
            return '';
        }
        return '.' + name_slice[name_slice.length-1];
    };

    /**
     * @param {string} filename 文件名称
     * @param {string} pre_str 前缀字符串
     */
    this.helper.genFileName = function(filename, pre_str='') {
        var org_name = `${pre_str}${Date.now()}`;
        var hash = crypto.createHash('sha1');
        hash.update(org_name);
        return hash.digest('hex') + the.helper.extName(filename);
    };
    
    /**
     * @param {object} upf 通过getFile获取的文件对象
     * @param {options} 选项，包括target(目标文件名)和path(目标目录)
     */
    this.helper.moveFile = function (upf, options) {
        if (!options.filename) {
            options.filename = the.helper.genFileName(upf.filename);
        }

        var target = options.path + '/' + options.filename;
        
        return new Promise((rv, rj) => {
            fs.writeFile(target, upf.data, {encoding : 'binary'}, err => {
                if (err) {
                    rj(err);
                } else {
                    rv({
                        filename : options.filename,
                        target : target,
                        oldname : upf.filename
                    });
                }
            });
        });
    };

    /**
     * 读取/etc/passwd获取用户信息。
     * 目前没有使用。
     * */
    this.helper.getUserInfo = function (username) {
        try {
            var matchuser = null;
            var filedata = fs.readFileSync('/etc/passwd', {encoding:'utf8'});
            var userlist = filedata.split('\n').filter(u => u.length > 0);
            var ureg = new RegExp(`^${username}:x`);

            for(var i=0; i<userlist.length; i++) {
                if (ureg.test(userlist[i])) {
                    matchuser = userlist[i].split(':').filter(p => p.length>0);
                    return {
                        username : username,
                        uid      : parseInt(matchuser[2]),
                        gid      : parseInt(matchuser[3])
                    };
                }
            }
        } catch (err) {
            return null;
        }
        return null;
    };

    this.methodList = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];

    this.ApiTable = {
        'GET'   : {},
        'POST'  : {},
        'PUT'   : {},
        'DELETE': {},
        'OPTIONS': {}
    };

    this.router = {};
    
    this.router.get = (api_path, callback, name='') => {
        the.addPath(api_path, 'GET', callback, name);
    };

    this.router.post = (api_path, callback, name='') => {
        the.addPath(api_path, 'POST', callback, name);
    };

    this.router.put = (api_path, callback, name='') => {
        the.addPath(api_path, 'PUT', callback, name);
    };

    this.router.delete = (api_path, callback, name='') => {
        the.addPath(api_path, 'DELETE', callback, name);
    };

    this.router.options = (api_path, callback, name = '') => {
        the.addPath(api_path, 'OPTIONS', callback, name);
    };

    this.router.any = (api_path, callback, name='') => {
        the.router.map(the.methodList, api_path, callback, name);
    };

    this.router.map = (marr, api_path, callback, name='') => {
        for(var i=0; i<marr.length; i++) {
            the.addPath(api_path, marr[i], callback, name);
        }
    };
    
    /*
        由于在路由匹配时会使用/分割路径，所以在添加路由时先处理好。
        允许:表示变量，*表示任何路由，但是二者不能共存，因为无法知道后面的是变量还是路由。
        比如：/static/*可以作为静态文件所在目录，但是后面的就直接作为*表示的路径，
        并不进行参数解析。
    */
    /**
     * @param {string} api_path 路由字符串
     * @param {string} method 请求方法类型
     * @param {function} callback 执行请求的回调函数
     * @param {string} name 请求名称，可以不填写
     */
    this.addPath = function(api_path, method, callback, name = '') {
        if (api_path[0] !== '/') {
            api_path = `/${api_path}`;
        }

        if (api_path.length > 1
            && api_path[api_path.length-1] == '/'
            && the.config.ignore_slash
        ) {
            api_path = api_path.substring(0, api_path.length-1);
        }

        var add_req = {
                isArgs:  false,
                isStar:  false,
                routeArr: [],
                ReqCall: callback,
                name : name
            };
        if (api_path.indexOf(':') >= 0) {
            add_req.isArgs = true;
        }
        if (api_path.indexOf('*') >= 0) {
            add_req.isStar = true;
        }

        if (add_req.isStar 
            && add_req.isArgs
        ) {
            var errinfo = `: * can not in two places at once ->  ${api_path}`;
            throw new Error(errinfo);
        }

        add_req.routeArr = api_path.split('/').filter(p => p.length > 0);

        switch (method) {
            case 'GET':
            case 'POST':
            case 'PUT':
            case 'DELETE':
            case 'OPTIONS':
                if (this.ApiTable[method][api_path]) {
                    throw new Error(`${api_path} conflict`);
                }
                this.ApiTable[method][api_path] = add_req;
                break;
            default:
                return ;
        }

    };

    this.mid_chain = [
        async function(ctx) {
            return ;
        },

        async function(rr, next) {
            if (typeof rr.requestCall === 'function'
                && rr.requestCall.constructor.name === 'AsyncFunction'
            ) {
                await rr.requestCall(rr);
            }
            return rr;
        }
    ];

    /*
        支持路由分组的解决方案（不改变已有代码即可使用）：
    */
    this.mid_group = {
        '*global*' : [this.mid_chain[0], this.mid_chain[1]]
    };

    //记录api的分组，只有在分组内的路径才会去处理，
    //这是为了避免不是通过分组添加但是仍然使用和分组相同前缀的路由也被当作分组内路由处理。
    this.api_group_table = {};
    
    /*
        添加中间件，第三个参数表示分组。
    */
    this.add = function(midcall, preg = null, group = null) {
        /*
            直接跳转下层中间件，根据匹配规则如果不匹配则执行此函数。
        */
        var genRealCall = function(prev_mid, group) {
            return async function(rr) {
                if (preg) {
                    if (
                        (typeof preg === 'string' && preg !== rr.routepath)
                        ||
                        (preg instanceof RegExp && !preg.test(rr.routepath))
                        ||
                        (preg instanceof Array && preg.indexOf(rr.routepath) < 0)
                    ) {
                        await the.mid_group[group][prev_mid](rr);
                        return rr;
                    }
                }
                await midcall(rr, the.mid_group[group][prev_mid]);
                return rr;
            };
        
        };

        var last = 0;
        if (group) {
            if (!the.mid_group[group]) {
                the.mid_group[group] = [the.mid_chain[0], the.mid_chain[1]];
            }
            last = the.mid_group[group].length - 1;
            the.mid_group[group].push(genRealCall(last, group));
        } else {
            //全局添加中间件
            for(var k in the.mid_group) {
                last = the.mid_group[k].length - 1;
                the.mid_group[k].push(genRealCall(last, k));
            }
        }
    };
    
    this.router.add = the.add;

    /**
     * 返回一个分组路由对象，主要便于路由分组操作
     * @param {string} grp 分组名称
     */
    this.group = function (grp) {
        if (grp == '' || grp[0] !== '/') {
            grp = `/${grp}`;
        }
        if (grp.length > 0 && grp[grp.length-1] == '/' && grp!=='/') {
            grp = grp.substring(0, grp.length-1);
        }

        var gt = {
            group_name : grp
        };

        gt.realPath = function (apath) {
            if (apath == '/' && the.config.ignore_slash) {
                return gt.group_name;
            }
            if (apath[0]!=='/') {
                if (gt.group_name!=='/') {
                    return `${gt.group_name}/${apath}`;
                } else {
                    return `${gt.group_name}${apath}`;
                }
            } else {
                if (gt.group_name!=='/') {
                    return `${gt.group_name}${apath}`;
                } else {
                    return apath;
                }
            }
        };

        gt.add_group_api = (apath) => {
            if (!the.api_group_table[gt.group_name]) {
                the.api_group_table[gt.group_name] = {};
            }
            the.api_group_table[gt.group_name][gt.realPath(apath)] = apath;
        };

        gt.get = function(apath, callback, name='') {
            gt.add_group_api(apath);
            the.router.get(gt.realPath(apath), callback, name);
        };

        gt.post = function(apath, callback, name='') {
            gt.add_group_api(apath);
            the.router.post(gt.realPath(apath), callback, name);
        };

        gt.delete = function(apath, callback, name='') {
            gt.add_group_api(apath);
            the.router.delete(gt.realPath(apath), callback, name);
        };

        gt.options = function(apath, callback, name='') {
            t.add_group_api(apath);
            the.router.options(gt.realPath(apath), callback, name);
        };

        gt.any = function(apath, callback, name='') {
            gt.add_group_api(apath);
            the.router.any(gt.realPath(apath), callback, name);
        };

        gt.map = function(marr, apath, callback, name='') {
            gt.add_group_api(apath);
            the.router.map(marr, gt.realPath(apath), callback, name);
        };

        gt.add = function(midcall, preg = null) {
            the.add(midcall, preg, gt.group_name);
        };
        
        return gt;
    };

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

    ctx.setHeader = {};

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

motoboat.prototype.findPath = function(path, method) {
    if (!this.ApiTable[method]) {
        return null;
    }
    if (path.length > 2042) {
        return null;
    }
    var path_split = path.split('/');
    path_split = path_split.filter(p => p.length > 0);
    if (path_split.length > 9) {
        return null;
    }

    var next = 0;
    var args = {};
    var rt = null;
    for (var k in this.ApiTable[method]) {
        rt = this.ApiTable[method][k];
        if (rt.isArgs === false && rt.isStar === false) {
            continue;
        }

        if (
          (rt.routeArr.length !== path_split.length && rt.isStar === false)
          ||
          (rt.isStar && rt.routeArr.length > path_split.length+1)
        ) {
            continue;
        }

        next = false;
        args = {};
        
        if (rt.isStar) {
            for(var i=0; i<rt.routeArr.length; i++) {
                if (rt.routeArr[i] == '*') {
                    args.starPath = path_split.slice(i).join('/');
                } else if(rt.routeArr[i] !== path_split[i]) {
                    next = true;
                    break;
                }
            }
        } else {
            for(var i=0; i<rt.routeArr.length; i++) {
                if (rt.routeArr[i][0] == ':') {
                    args[rt.routeArr[i].substring(1)] = path_split[i];
                } else if (rt.routeArr[i] !== path_split[i]) {
                    next = true;
                    break;
                }
            }
        }

        if (next) {continue;}

        return {key: k, args: args};
    }

    return null;
};

motoboat.prototype.findRealPath = function(path, method) {
    var route_path = null;
    if (path.length > 1
        && path[path.length-1] == '/'
        && this.config.ignore_slash
    ) {
        path = path.substring(0, path.length-1);
    }

    if (this.ApiTable[method][path] !== undefined) {
        route_path = path;
    }

    if (route_path && route_path.indexOf('/:') >= 0) {
        route_path = null;
    }

    var parg = null;
    if (route_path === null) {
        parg = this.findPath(path, method);
    } else {
        parg = {args : {}, key: route_path};
    }
    return parg;
};

/**
 * 执行请求的包装方法，会根据请求上下文信息查找路由表，确定是否可执行。
 * 如果是上传文件，并且开启了自动解析选项，则会解析文件数据。
 * 最后会调用runMiddleware方法。
 * @param {object} ctx 请求上下文实例。
 */
motoboat.prototype.execRequest = function (ctx) {
    var r = this.ApiTable[ctx.method][ctx.routepath];
    ctx.requestCall = r.ReqCall;
    //用于分组检测
    ctx.group = '/' + r.routeArr[0];
    if (!this.api_group_table[ctx.group] 
        || !this.api_group_table[ctx.group][ctx.routepath]
    ) {
        ctx.group = '';
    }
    ctx.name = r.name;

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
        this.parseUploadData(ctx);
    }
    
    return this.runMiddleware(ctx);
};

/**
 * 执行中间件，其中核心则是请求回调函数。
 * @param {object} ctx 请求上下文实例。
 */
motoboat.prototype.runMiddleware = async function (ctx) {
    try {
        var group = '*global*';
        if (ctx.group !== '') {
            group = ctx.group;
        }
        var last = this.mid_group[group].length-1;
        await this.mid_group[group][last](ctx, this.mid_group[group][last-1]);
    } catch (err) {
        if (this.config.debug) {
            console.log(err);
        }
        ctx.res.status(500);
        ctx.response.end();
    }
};

/*
    multipart/form-data
    multipart/byteranges不支持
*/
motoboat.prototype.checkUploadHeader = function(headerstr) {
    var preg = /multipart.* boundary.*=/i;
    if (preg.test(headerstr)) {
        return true;
    }
    return false;
};

/*
    解析上传文件数据的函数，此函数解析的是整体的文件，
    解析过程参照HTTP/1.1协议。
*/
motoboat.prototype.parseUploadData = function(ctx) {
    var bdy = ctx.headers['content-type'].split('=')[1];
    bdy = bdy.trim();
    bdy = `--${bdy}`;
    //var end_bdy = bdy + '--';

    var bdy_crlf = `${bdy}\r\n`;
    var crlf_bdy = `\r\n${bdy}`;

    var file_end = 0;
    var file_start = 0;

    file_start = ctx.rawBody.indexOf(bdy_crlf);
    if (file_start < 0) {
        return ;
    }
    file_start += bdy_crlf.length;
    var end_break = (this.config.max_files > 0) ? this.config.max_files : 15;
    var i=0; //保证不出现死循环或恶意数据产生大量无意义循环
    while(i < end_break) {
        file_end = ctx.rawBody.indexOf(crlf_bdy, file_start);
        if (file_end <= 0) { break; }

        this.parseSingleFile(ctx, file_start, file_end);
        file_start = file_end + bdy_crlf.length;
        i++;
    }
    ctx.rawBody = '';
};

//解析单个文件数据
motoboat.prototype.parseSingleFile = function(ctx, start_ind, end_ind) {
    var header_end_ind = ctx.rawBody.indexOf('\r\n\r\n',start_ind);

    var header_data = Buffer.from(
            ctx.rawBody.substring(start_ind, header_end_ind), 
            'binary'
        ).toString('utf8');
    
    var file_post = {
        filename        : '',
        'content-type'  : '',
        data            : '',
    };
    
    file_post.data = ctx.rawBody.substring(header_end_ind+4, end_ind);

    //parse header
    if (header_data.search("Content-Type") < 0) {
        //post form data, not file data
        var form_list = header_data.split(";");
        var tmp;
        for(var i=0; i<form_list.length; i++) {
            tmp = form_list[i].trim();
            if (tmp.search("name=") > -1) {
                var name = tmp.split("=")[1].trim();
                name = name.substring(1, name.length-1);
                ctx.bodyparam[name] = Buffer.from(file_post.data, 'binary').toString('utf8');
                break;
            }
        }
    } else {
        //file data
        var form_list = header_data.split("\r\n").filter(s => s.length > 0);
        var tmp_name = form_list[0].split(";");

        var name = '';
        for (var i=0; i<tmp_name.length; i++) {
            if (tmp_name[i].search("filename=") > -1) {
                file_post.filename = tmp_name[i].split("=")[1].trim();
                file_post.filename = file_post.filename.substring(1, file_post.filename.length-1);
            } else if (tmp_name[i].search("name=") > -1) {
                name = tmp_name[i].split("=")[1].trim();
                name = name.substring(1, name.length-1);
            }
        }

        if (name == '') {
            file_post.data = '';
            return ;
        }

        file_post['content-type'] = form_list[1].split(":")[1].trim();
        
        if (ctx.files[name] === undefined) {
            ctx.files[name] = [file_post];
        } else {
            ctx.files[name].push(file_post);
        }
    }
};

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

/*
    这是最终添加的请求中间件。基于洋葱模型，
    这个中间件最先执行，所以最后会返回响应结果。
*/
motoboat.prototype.addFinalResponse = function () {
    var fr = async function(rr, next) {
        if (!rr.response.getHeader('content-type')) {
            rr.response.setHeader('content-type', 'text/html;charset=utf8');
        }
        await next(rr);

        if (rr.res.data === null || rr.res.data === false) {
            rr.response.end();
        } else if (typeof rr.res.data === 'object') {
            rr.response.end(JSON.stringify(rr.res.data));
        } else if (typeof rr.res.data === 'string') {
            rr.response.end(rr.res.data, 'binary');
        } else {
            rr.response.end();
        }
    };
    this.add(fr);
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
        if (urlobj.pathname == '') {
            urlobj.pathname = '/';
        }

        var real_path = '';
        real_path = the.findRealPath(urlobj.pathname, req.method);
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
        ctx.routepath = real_path.key;
        ctx.args = real_path.args;
        ctx.param = urlobj.query;
        ctx.setHeader = res.setHeader;
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

motoboat.prototype.loadInfo = [];
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
