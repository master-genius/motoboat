/**
 * module middleware
 * Copyright (c) [2019.08] BraveWang
 * This software is licensed under the MPL-2.0.
 * You can use this software according to the terms and conditions of the MPL-2.0.
 * See the MPL for more details:
 *     https://www.mozilla.org/en-US/MPL/2.0/
 */
'use strict';

function middleware (options = {}) {
    var mw = {
        debug : true,
    };

    if (options && options.debug !== undefined) {
        mw.debug = options.debug;
    }

    mw.globalKey = '*GLOBAL*';

    mw.mid_chain = [
        async function (ctx) {
            return await ctx.requestCall(ctx);
        }
    ];

    mw.mid_group = {};
    mw.mid_group[mw.globalKey] = [ mw.mid_chain[0] ];

    /**
     * 添加中间件。
     * @param {async function} midcall 接受参数(ctx, next)。
     * @param {string|RegExp|Array|object} options 选项。
     * @param {object} groupTable router记录的路由分组。
     * options如果是字符串则表示针对分组添加中间件，如果是数组或正则表达式则表示匹配规则。
     * 如果你想针对某一分组添加中间件，同时还要设置匹配规则，则可以使用以下形式：
     * {
     *   preg : RegExp | string | Array,
     *   group : string
     * }
     */
    mw.add = function (midcall, groupTable, options = {}) {
        var preg = null;
        var group = null;
        var method = null;
        if (typeof options === 'string') {
            preg = options;
        } else if (options instanceof Array) {
            preg = options;
        } else if (typeof options === 'object') {
            if (options.preg !== undefined) {
               preg = options.preg;
            }
            if (options.group !== undefined && typeof options.group === 'string') {
               group = options.group;
            }
            if (options.method !== undefined) {
                method = options.method;
                if (typeof method !== 'string' && !(method instanceof Array)) {
                    method = null;
                }
            }
        }

        if(typeof preg === 'string') {
            if (preg.length > 0) {
                preg = [ preg ];
            } else {
                preg = null;
            }
        } else if (! (preg instanceof Array) ) {
            preg = null;
        }

        /* 根据匹配规则如果不匹配则跳过这一层函数。*/
        var genRealCall = function(prev_mid, group) {
            return async function (rr) {
                if (method !== null && method.indexOf(rr.method) < 0) {
                    return await mw.mid_group[group][prev_mid](rr);
                }
                if (preg !== null && preg.indexOf(rr.routepath) < 0) {
                    return await mw.mid_group[group][prev_mid](rr);
                }
                return await midcall(rr, mw.mid_group[group][prev_mid]);
            };
        };

        var last = 0;
        if (group) {
            if (!mw.mid_group[group]) {
                mw.initGroup(group);
            }
            last = mw.mid_group[group].length - 1;
            mw.mid_group[group].push(genRealCall(last, group));
        } else {
            //全局添加中间件
            for(var k in groupTable) {
                if (mw.mid_group[k] === undefined) {
                    mw.initGroup(k);
                }
                last = mw.mid_group[k].length - 1;
                mw.mid_group[k].push(genRealCall(last, k));
            }
            last = mw.mid_group[mw.globalKey].length - 1;
            mw.mid_group[mw.globalKey].push(genRealCall(last, mw.globalKey));
        }
    };

    //如果某一分组添加时，已经有全局中间件，需要先把全局中间件添加到此分组。
    mw.initGroup = function (group) {
        mw.mid_group[group] = [];
        for(var i=0; i < mw.mid_group[mw.globalKey].length; i++) {
            mw.mid_group[group].push(mw.mid_group[mw.globalKey][i]);
        }
    };

    /**
     * 按照条件添加中间件到多个分组或匹配。
     * @param {function} midcall
     * @param {array} mapcond
     */
    mw.addMore = function (midcall, groupTable, mapcond) {
        if (! (mapcond instanceof Array)) {
            throw new Error('mapcond must be array');
        }
        for (let i=0; i<mapcond.length; i++) {
            mw.add(midcall, groupTable, mapcond[i]);
        }
    };

    /**
     * 执行中间件，其中核心则是请求回调函数。
     * @param {object} ctx 请求上下文实例。
     */
    mw.runMiddleware = async function (ctx) {
        try {
            var group = mw.globalKey;
            if (ctx.group != '' && mw.mid_group[ctx.group] !== undefined) {
                group = ctx.group;
            }
            var last = mw.mid_group[group].length-1;
            await mw.mid_group[group][last](ctx);
        } catch (err) {
            if (mw.debug) { console.log('--DEBUG--RESPONSE--:',err); }
            try {
                if (ctx.response) {
                    ctx.response.statusCode = 500;
                    ctx.response.end();
                }
            } catch (err) {}
        } finally {
            ctx.requestCall = null;
            ctx.request = null;
            ctx.response = null;
            ctx.files = null;
            ctx.body = null;
            ctx.rawBody = '';
            ctx.headers = null;
            ctx.res.body = null;
            ctx.box = null;
        }
    };

    /** 这是最终添加的请求中间件。基于洋葱模型，这个中间件最先执行，所以最后会返回响应结果。*/
    mw.addFinalResponse = function (groupTable) {
        var fr = async function(ctx, next) {
            await next(ctx);
            if (!ctx.response || ctx.response.finished) { return ; }

            var content_type = 'text/plain;charset=utf-8';
            var datatype = typeof ctx.res.body;
            if (!ctx.response.headersSent) {
                if (datatype == 'object') {
                    ctx.response.setHeader('content-type','text/json;charset=utf-8');
                } else if (!ctx.response.hasHeader('content-type')
                    && datatype == 'string' && ctx.res.body.length > 1
                ) {
                    switch (ctx.res.body[0]) {
                        case '{':
                        case '[':
                            content_type = 'text/json;charset=utf-8'; break;
                        case '<':
                            if (ctx.res.body[1] == '!') {
                                content_type = 'text/html;charset=utf-8';
                            } else {
                                content_type = 'text/xml;charset=utf-8';
                            }
                            break;
                        default:;
                    }
                    ctx.response.setHeader('content-type', content_type);
                }
            }
            
            if (datatype == 'object' || datatype == 'boolean') {
                ctx.response.end(JSON.stringify(ctx.res.body));
            } else if (datatype == 'string') {
                ctx.response.end(ctx.res.body, ctx.res.encoding);
            } else {
                ctx.response.end();
            }
        };
        mw.add(fr, groupTable, {});
    };
    return mw;
}

module.exports = middleware;
