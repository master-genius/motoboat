/**
 * module bodyparser
 * Copyright (c) [2019.08] BraveWang
 * This software is licensed under the MPL-2.0.
 * You can use this software according to the terms and conditions of the MPL-2.0.
 * See the MPL for more details:
 *     https://www.mozilla.org/en-US/MPL/2.0/
 */
'use strict';

var bodyParser = {};
/*
    解析上传文件数据的函数，此函数解析的是整体的文件，
    解析过程参照HTTP/1.1协议。
*/
bodyParser.parseUploadData = function (ctx, max_files = 15) {
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
    var end_break = (max_files > 0) ? max_files : 15;
    var i=0; //保证不出现死循环或恶意数据产生大量无意义循环
    while(i < end_break) {
        file_end = ctx.rawBody.indexOf(crlf_bdy, file_start);
        if (file_end <= 0) { break; }

        this.parseSingleFile(ctx, file_start, file_end);
        file_start = file_end + bdy_crlf.length;
        i++;
    }
    ctx.rawBody = '';
};

//解析单个文件数据
bodyParser.parseSingleFile = function(ctx, start_ind, end_ind) {
    var header_end_ind = ctx.rawBody.indexOf('\r\n\r\n',start_ind);

    var header_data = Buffer.from(
            ctx.rawBody.substring(start_ind, header_end_ind), 
            'binary'
        ).toString('utf8');
    
    var file_post = {
        filename        : '',
        'content-type'  : '',
        data            : '',
        length          : 0,
    };
    
    file_post.data = ctx.rawBody.substring(header_end_ind+4, end_ind);
    file_post.length = end_ind - 4 - header_end_ind;

    //parse header
    if (header_data.search("Content-Type") < 0) {
        //post form data, not file data
        var form_list = header_data.split(";");
        var tmp;
        for(var i=0; i<form_list.length && i < 10; i++) {
            tmp = form_list[i].trim();
            if (tmp.search("name=") > -1) {
                var name = tmp.split("=")[1].trim();
                name = name.substring(1, name.length-1);
                ctx.body[name] = Buffer.from(file_post.data, 'binary').toString('utf8');
                break;
            }
        }
    } else {
        //file data
        var form_list = header_data.split("\r\n").filter(s => s.length > 0);
        var tmp_name = form_list[0].split(";");

        var name = '';
        for (var i=0; i<tmp_name.length && i < 10; i++) {
            if (tmp_name[i].search("filename=") > -1) {
                file_post.filename = tmp_name[i].split("=")[1].trim();
                file_post.filename = file_post.filename.substring(1, file_post.filename.length-1);
            } else if (tmp_name[i].search("name=") > -1) {
                name = tmp_name[i].split("=")[1].trim();
                name = name.substring(1, name.length-1);
            }
        }

        if (name == '') {
            file_post.data = '';
            return ;
        }

        file_post['content-type'] = form_list[1].split(":")[1].trim();
        
        if (ctx.files[name] === undefined) {
            ctx.files[name] = [file_post];
        } else {
            ctx.files[name].push(file_post);
        }
    }
};

module.exports = bodyParser;
