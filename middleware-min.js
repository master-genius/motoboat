/**
 * module minimal middleware
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

    mw.midChain = [
        async function (ctx) {
            return await ctx.requestCall(ctx);
        }
    ];

    //缓存添加的中间件列表，最后逆序添加，则可以实现按照正常顺序写代码的逻辑。
    mw.stackCache = [];
    
    /**
     * @param {function} midcall 回调函数
     * @param {array|object|string} 选项
     */
    mw.addCache = function (midcall, options = {}) {
        mw.stackCache.push(midcall);
    };

    /**
     * @param {object} groupTable 路由分组表，此处只是作为形式，为了统一接口调用
     */
    mw.addFromCache = function (groupTable=null) {
        for (let i = mw.stackCache.length-1; i>=0; i--) {
            mw.add(mw.stackCache[i]);
        }
    };

    /**
     * 添加中间件。
     * @param {async function} midcall 接受参数(ctx, next)
     */
    mw.add = function (midcall) {
        var last = mw.midChain.length - 1;
        var realMid = async (ctx) => {
            return await midcall(ctx, mw.midChain[last]);
        };
        mw.midChain.push(realMid);
        return mw;
    };

    /**
     * 执行中间件，其中核心则是请求回调函数。
     * @param {object} ctx 请求上下文实例。
     */
    mw.runMiddleware = async function (ctx) {
        try {
            var last = mw.midChain.length-1;
            await mw.midChain[last](ctx);
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
    mw.addFinalResponse = function () {
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
        mw.add(fr);
    };
    return mw;
}

module.exports = middleware;
