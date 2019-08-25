/**
 * module helper
 * Copyright (c) [2019.08] BraveWang
 * This software is licensed under the MPL-2.0.
 * You can use this software according to the terms and conditions of the MPL-2.0.
 * See the MPL for more details:
 *     https://www.mozilla.org/en-US/MPL/2.0/
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
 * @param {object} upf 通过getFile获取的文件对象
 * @param {options} 选项，包括target(目标文件名)和path(目标目录)
 */
helper.moveFile = function (upf, options) {
    if (!options.filename) {
        options.filename = helper.genFileName(upf.filename,
            `${(Math.random()*10000).toFixed(0)}`);
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

module.exports = helper;
