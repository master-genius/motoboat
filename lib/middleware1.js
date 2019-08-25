/**
 * module middleware
 * Copyright (c) [2019.08] BraveWang
 * This software is licensed under the MPL-2.0.
 * You can use this software according to the terms and conditions of the MPL-2.0.
 * See the MPL for more details:
 *     https://www.mozilla.org/en-US/MPL/2.0/
 */
'use strict';

const midCore = require('./midcore');

class middleware extends midCore {
    /**
     * 执行中间件，其中核心则是请求回调函数。
     * @param {object} ctx 请求上下文实例。
     */
    async run (ctx) {
        try {
            var group = this.globalKey;
            if (ctx.group != '' && this.mid_group[ctx.group] !== undefined) {
                group = ctx.group;
            }
            var last = this.mid_group[group].length-1;
            await this.mid_group[group][last](ctx);
        } catch (err) {
            if (this.debug) { console.log('--DEBUG--RESPONSE--:',err); }
            try {
                if (ctx.response) {
                    ctx.response.statusCode = 500;
                    ctx.response.end();
                }
            } catch (err) {}
        } finally {
            ctx.app = null;
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
    addFinal (groupTable) {
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
        this.add(fr, groupTable, {});
    }

}

module.exports = middleware;
