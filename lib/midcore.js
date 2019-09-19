/**
 * module middleware core
 * Copyright (c) [2019.08] BraveWang
 * This software is licensed under the MPL-2.0.
 * You can use this software according to the terms and conditions of the MPL-2.0.
 * See the MPL for more details:
 *     https://www.mozilla.org/en-US/MPL/2.0/
 */
'use strict';

class midCore {

    constructor (options = {}) {
        this.debug = true;
        if (options.debug !== undefined) {
            this.debug = options.debug;
        }

        this.mid_chain = [];

        this.globalKey = '*GLOBAL*';
        
        this.mid_group = {};

        this.mid_group[this.globalKey] = [
            async (ctx) => {
                return await ctx.requestCall(ctx);
            }
        ];

        this.stack_cache = [];
    }

    /**
     * @param {function} midcall 回调函数
     * @param {array|object|string} 选项
     */
    addCache(midcall, options = {}) {
        this.stack_cache.push({
            callback: midcall,
            options: options
        });
    };

    /**
     * @param {object} groupTable 路由分组表
     */
    addFromCache(groupTable) {
        for (let i = this.stack_cache.length-1; i>=0; i--) {
            this.add(this.stack_cache[i].callback,
                groupTable,
                this.stack_cache[i].options
            );
        }
        this.stack_cache = [];
    };

    //如果某一分组添加时，已经有全局中间件，需要先把全局中间件添加到此分组。
    initGroup(group) {
        this.mid_group[group] = [];
        for(var i=0; i < this.mid_group[this.globalKey].length; i++) {
            this.mid_group[group].push(this.mid_group[this.globalKey][i]);
        }
    };

    /**
     * 添加中间件。
     * @param {async function} midcall 接受参数(ctx, next)。
     * @param {string|Array|object} options 选项。
     * @param {object} groupTable router记录的路由分组。
     * options如果是字符串则表示针对分组添加中间件，如果是数组或正则表达式则表示匹配规则。
     * 如果你想针对某一分组添加中间件，同时还要设置匹配规则，则可以使用以下形式：
     * {
     *   pathname  : string | Array,
     *   group : string
     * }
     */
    add(midcall, groupTable, options = {}) {
        if (typeof midcall !== 'function'
            || midcall.constructor.name !== 'AsyncFunction')
        {
            throw new Error('callback and middleware function must use async');
        }
        var pathname = null;
        var group = null;
        var method = null;
        if (typeof options === 'string') {
            pathname = options;
        } else if (options instanceof Array) {
            pathname = options;
        } else if (typeof options === 'object') {
            if (options.name !== undefined) {
                pathname = options.name;
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

        if(typeof pathname === 'string') {
            if (pathname.length > 0) {
                pathname = [ pathname ];
            } else {
                pathname = null;
            }
        } else if (! (pathname instanceof Array) ) {
            pathname = null;
        }

        var self = this;
        var genRealCall = function(prev_mid, grp) {
            return async (rr) => {
                if (method !==null && method.indexOf(rr.method) < 0) {
                    return await self.mid_group[grp][prev_mid](rr);
                }
                if (pathname !== null && pathname.indexOf(rr.name) < 0) {
                    return await self.mid_group[grp][prev_mid](rr);
                }
                return await midcall(rr, self.mid_group[grp][prev_mid]);
            };
        };

        var last = 0;
        if (group) {
            if (!this.mid_group[group]) {
                this.initGroup(group);
            }
            last = this.mid_group[group].length - 1;
            this.mid_group[group].push(genRealCall(last, group));
        } else {
            //全局添加中间件
            for(var k in groupTable) {
                if (this.mid_group[k] === undefined) {
                    this.initGroup(k);
                }
                last = this.mid_group[k].length - 1;
                this.mid_group[k].push(genRealCall(last, k));
            }
            last = this.mid_group[this.globalKey].length - 1;
            this.mid_group[this.globalKey].push(genRealCall(last, this.globalKey));
        }
        return this;
    }

}

module.exports = midCore;
