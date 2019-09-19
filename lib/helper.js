/**
    module router
    Copyright (C) 2019.08 BraveWang
    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation; either version 3 of the License , or
    (at your option) any later version.
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');

var helper = {};

/**
 * @param {string} filename 文件名称
 */
helper.extName = function (filename) {
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
helper.genFileName = function(filename = '', pre_str='') {
    var org_name = `${pre_str}${Date.now()}`;
    var hash = crypto.createHash('sha1');
    hash.update(org_name);
    return hash.digest('hex') + ((filename=='') ? '' : helper.extName(filename));
};

/**
 * @param {object} ctx 请求上下文对象
 * @param {object} upf 通过getFile获取的文件对象
 * @param {options} 选项，包括target(目标文件名)和path(目标目录)
 */
helper.moveFile = async function (ctx, upf, options) {
    if (!options.filename) {
        options.filename = helper.genFileName(upf.filename,
            `${(Math.random()*10000).toFixed(0)}`);
    }
    var target = options.path + '/' + options.filename;
    try {
        let fd = await new Promise((rv, rj) => {
            fs.open(target, 'w+', 0o644, (err, fd) => {
                if (err) { rj(err); }
                else { rv(fd); }
            });
        });
        return new Promise((rv, rj) => {
            fs.write(fd, ctx.rawBody, upf.start, upf.length, 
                (err,bytesWritten,buffer) => {
                    if (err) { rj(err); }
                    else { rv(bytesWritten); }
                });
        })
        .then(d => {
            return {target:target, filename: options.filename};
        }, e => { throw e; })
        .finally(() => {
            fs.close(fd, (err) => {});
        });
    } catch (err) {
        throw err;
    }
};

module.exports = helper;
