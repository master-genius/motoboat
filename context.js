'use strict';

const helper = require('./helper');

var context = function () {
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
        helper: helper,

        request     : null,
        response    : null,

        res         : {
            statusCode : 200,
            body : '',
            encoding : 'utf8'
        },

        box : {},
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

    ctx.res.write = function(data) {
        if (typeof data === 'string') {
            ctx.res.body += data;
        } else if (body instanceof Buffer) {
            ctx.res.body += data.toString(ctx.res.encoding);
        } else if (typeof data === 'number') {
            ctx.res.body += data.toString();
        }
    };

    ctx.res.status = function(stcode = null) {
        if (stcode === null) { return ctx.response.statusCode; }
        if(ctx.response) { ctx.response.statusCode = stcode; }
    };
    ctx.moveFile = helper.moveFile;

    return ctx;
};

module.exports = context;
