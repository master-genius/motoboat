/**
    module connfilter
    Copyright (C) 2019.08 BraveWang
    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation; either version 3 of the License , or
    (at your option) any later version.
 */

'use strict';

/**
 * 请求过滤模块，此模块要挂载到connection事件上。
 * @param {object} options 选项值参考：
 * - peerTime  {number}
 * - maxConn   {number}
 * - deny      {array}
 * - allow     {array}
 * rundata是运行时数据，这个数据需要实时更新到负载监控，所以可以通过传递一个对象指向全局应用。
 * 
 */
var connfilter = function (limit, rundata) {

    if (! (this instanceof connfilter)) {
        return new connfilter(limit, rundata);
    }
    
    var the = this;

    this.iptable = {};
    this.rundata = rundata;
    this.limit = limit;

    /**
     * 请求过滤函数。
     * @param {object} sock 当前请求的socket实例。
     */
    this.callback = (sock) => {
        //检测是否在拒绝IP列表中。
        if (the.limit.deny.length > 0 
            && the.limit.deny.indexOf(sock.remoteAddress)>=0)
        {
            sock.destroy();
            return false;
        }
        
        the.rundata.conn += 1;
        sock.on('close', () => {
            the.rundata.conn -= 1;
        });

        //检测是否超过最大连接数限制。
        if (the.limit.maxConn > 0 
            && the.rundata.conn > the.limit.maxConn
        ) {
            sock.destroy();
            return false;
        }

        //如果开启了单元时间内单个IP最大访问次数限制则检测是否合法。
        var remote_ip = sock.remoteAddress;
        if (the.limit.maxIPRequest > 0
            && the.limit.allow.indexOf(remote_ip) < 0)
        {
            if (the.iptable[remote_ip] !== undefined) {
                if (the.iptable[remote_ip] >= the.limit.maxIPRequest) {
                    sock.destroy();
                    return false;
                } else {
                    the.iptable[remote_ip] += 1;
                }
            }
            else if (Object.keys(the.iptable).length >= the.limit.maxIPCache)
            {
                /** 
                 * 如果已经超过IP最大缓存数量限制则关闭连接，这种情况在极端情况下会出现。
                 * 不过最大缓存数量不能低于最大连接数。否则并发支持会受限制。
                 * */
                sock.destroy();
                return false;
            } else {
                the.iptable[remote_ip] = 1;
            }
        }
        return true;
    };

    /**
     * 限制IP请求次数的定时器。
     */
    this.inervalId = setInterval(() => {
                        the.iptable = {};
                    }, limit.peerTime * 1000);

};

module.exports = connfilter;
