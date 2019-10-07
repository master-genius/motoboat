/**
    module bodyparser
    Copyright (C) 2019.08 BraveWang
    This program is free software; you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation; either version 3 of the License , or
    (at your option) any later version.
 */

'use strict';

const qs = require('querystring');

class bodyparser {

    constructor (options = {}) {
        this.maxFiles = 15;
        if (typeof options === 'object') {
            if (options.maxFiles 
                && typeof options.maxFiles === 'number' 
                && parseInt(options.maxFiles) > 0)
            {
                this.maxFiles = parseInt(options.maxFiles);
            }
        }
        this.pregUpload = /multipart.* boundary.*=/i;
        this.formType = 'application/x-www-form-urlencoded';
    }
    /*
        解析上传文件数据的函数，此函数解析的是整体的文件，
        解析过程参照HTTP/1.1协议。
    */
    parseUploadData (ctx) {
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
        var i=0; //保证不出现死循环或恶意数据产生大量无意义循环
        while(i < this.maxFiles) {
            file_end = ctx.rawBody.indexOf(crlf_bdy, file_start);
            if (file_end <= 0) { break; }
    
            this.parseSingleFile(ctx, file_start, file_end);
            file_start = file_end + bdy_crlf.length;
            i++;
        }
    }

    parseSingleFile (ctx, start_ind, end_ind) {
        var header_end_ind = ctx.rawBody.indexOf('\r\n\r\n',start_ind);
    
        var header_data = ctx.rawBody.toString('utf8', start_ind, header_end_ind);
        
        var file_post = {
            filename        : '',
            'content-type'  : '',
            start           : 0,
            end             : 0,
            length          : 0,
        };
        
        file_post.start = header_end_ind+4;
        file_post.end = end_ind;
        file_post.length = end_ind - 4 - header_end_ind;
    
        //parse header
        if (header_data.search("Content-Type") < 0) {
            //post form data, not file data
            var form_list = header_data.split(";");
            var tmp;
            let nind = 0;
            for(var i=0; i<form_list.length && i < 10; i++) {
                tmp = form_list[i].trim();
                nind = tmp.indexOf('name="');
                if (nind > -1) {
                    let name = tmp.substring(nind+6, tmp.length-1).trim();
                    ctx.body[name] = ctx.rawBody.toString('utf8', 
                                        file_post.start, 
                                        file_post.end);
                    break;
                }
            }
        } else {
            //file data
            var form_list = header_data.split("\r\n").filter(s => s.length > 0);
            var tmp_name = form_list[0].split(";");
    
            var name = '';
            let fnameind = 0;
            for (var i=0; i<tmp_name.length && i < 10; i++) {
                fnameind = tmp_name[i].indexOf('filename="');
                if (fnameind > -1) {
                    file_post.filename = tmp_name[i]
                                            .substring(fnameind+10,
                                                tmp_name[i].length-1
                                            ).trim();
                    continue;
                }
                fnameind = tmp_name[i].indexOf('name="');
                if (fnameind > -1) {
                    name = tmp_name[i].substring(
                                    fnameind+6, 
                                    tmp_name[i].length-1
                                ).trim();
                }
            }
    
            if (name == '') {
                return ;
            }
    
            if (form_list.length > 0) {
                file_post['content-type'] = form_list[1].split(":")[1].trim();
            }
            
            if (ctx.files[name] === undefined) {
                ctx.files[name] = [file_post];
            } else {
                ctx.files[name].push(file_post);
            }
        }
    }

    checkUploadHeader (headerstr) {
        if (this.pregUpload.test(headerstr)) {
            return true;
        }
        return false;
    }

    middleware () {
        var self = this;
        var mid = async (ctx, next) => {
            if ((ctx.method == 'POST' || ctx.method == 'PUT' || ctx.method == 'DELETE' || ctx.method == 'PATCH')
            && ctx.rawBody.length > 0)
            {
                if (self.checkUploadHeader(ctx.headers['content-type'])) {
                    ctx.isUpload = true;
                    self.parseUploadData(ctx, self.maxFiles);
                } else if (ctx.headers['content-type']
                    && ctx.headers['content-type'].indexOf(self.formType) >= 0)
                {
                    ctx.body = qs.parse(ctx.rawBody.toString('utf8'));
                } else {
                    ctx.body = ctx.rawBody.toString('utf8');
                }
            }
            await next(ctx);
        };
        return mid;
    }
}

module.exports = bodyparser;
