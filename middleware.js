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

    mw.mid_chain = [
        async function(ctx) {
            return ;
        },

        async function(rr, next) {
            await rr.requestCall(rr);
            /* if (typeof rr.requestCall === 'function'
                && rr.requestCall.constructor.name === 'AsyncFunction'
            ) {
                await rr.requestCall(rr);
            } */
            return rr;
        }
    ];

    /*
        支持路由分组的解决方案（不改变已有代码即可使用）：
    */
    mw.mid_group = {
        '*global*' : [mw.mid_chain[0], mw.mid_chain[1]]
    };

    /**
     * 添加中间件。
     * @param {async function} midcall 接受参数(ctx, next)。
     * @param {string|RegExp|Array|object} options 选项。
     * options如果是字符串则表示针对分组添加中间件，如果是数组或正则表达式则表示匹配规则。
     * 如果你想针对某一分组添加中间件，同时还要设置匹配规则，则可以使用以下形式：
     * {
     *   preg : RegExp | string | Array,
     *   group : string
     * }
     */
    mw.add = function (midcall, options = {}) {
        var preg = null;
        var group = null;
        if (typeof options === 'string') {
            group = options;
        } else if (options instanceof Array || options instanceof RegExp) {
            preg = options;
        } else if (typeof options === 'object') {
            if (options.preg !== undefined) {
               preg = options.preg;
            }
            if (options.group !== undefined) {
               group = options.group;
            }
        }
        /* 根据匹配规则如果不匹配则跳过这一层函数。*/
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
                        await mw.mid_group[group][prev_mid](rr);
                        return rr;
                    }
                }
                await midcall(rr, mw.mid_group[group][prev_mid]);
                return rr;
            };
        
        };

        var last = 0;
        if (group) {
            if (!mw.mid_group[group]) {
                mw.mid_group[group] = [mw.mid_chain[0], mw.mid_chain[1]];
            }
            last = mw.mid_group[group].length - 1;
            mw.mid_group[group].push(genRealCall(last, group));
        } else {
            //全局添加中间件
            for(var k in mw.mid_group) {
                last = mw.mid_group[k].length - 1;
                mw.mid_group[k].push(genRealCall(last, k));
            }
        }
    };

    /**
     * 执行中间件，其中核心则是请求回调函数。
     * @param {object} ctx 请求上下文实例。
     */
    mw.runMiddleware = async function (ctx) {
        try {
            var group = '*global*';
            if (ctx.group !== '') { group = ctx.group; }

            var last = mw.mid_group[group].length-1;
            await mw.mid_group[group][last](ctx, mw.mid_group[group][last-1]);
        } catch (err) {
            if (mw.debug) {
                console.log(err);
            }
            ctx.res.status(500);
            ctx.response.end();
        }
    };

    /*
        这是最终添加的请求中间件。基于洋葱模型，
        这个中间件最先执行，所以最后会返回响应结果。
    */
    mw.addFinalResponse = function () {
        var fr = async function(ctx, next) {
            if (!ctx.response.getHeader('content-type')) {
                ctx.response.setHeader('content-type', 'text/html;charset=utf-8');
            }
            try {
                await next(ctx);
                if (ctx.res.data === null || ctx.res.data === false) {
                    ctx.response.end();
                } else if (typeof ctx.res.data === 'object') {
                    ctx.response.end(JSON.stringify(ctx.res.data));
                } else if (typeof ctx.res.data === 'string') {
                    ctx.response.end(ctx.res.data, ctx.res.encoding);
                } else {
                    ctx.response.end();
                }
            } catch (err) {
                throw err;
            }
            finally {
                //最后会销毁对象数据，如果程序内使用了闭包永久留住ctx对象，则这些关键数据无法再访问。
                ctx.requestCall = null;
                ctx.request = null;
                ctx.response = null;
                ctx.files = null;
                ctx.bodyparam = null;
                ctx.rawBody = '';
                ctx.headers = null;
            }
        };
        mw.add(fr);
    };
    return mw;
}

module.exports = middleware;
