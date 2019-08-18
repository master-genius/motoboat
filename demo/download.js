'use strict'

const mot = require('../motoboat');
const fs = require('fs');

var srv = new mot();

var {router} = srv;

router.get('/download', async c => {
    var filename = '太极宗师片尾曲.mkv';
    var ufilename = encodeURIComponent(filename);
    var filepath = process.env.HOME + '/videos/' + filename;
    var headers = {
        'content-type' : 'application/octet-stream',
        'content-disposition' : 'attachment;filename="'+ufilename+"\"; filename*=utf-8''"+ufilename,
        'content-length' : fs.statSync(filepath).size
    };
    c.response.writeHead(200, headers);

    await new Promise((rv, rj) => {
        var fstr = fs.createReadStream(filepath, {bufferSize: 4096});
        fstr.pipe(c.response, {end: false});
        fstr.on('end', () => {
            rv();
        });
    });

});

srv.run(5678);
