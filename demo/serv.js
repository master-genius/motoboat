'use strict';

const titbit = require('../main');
const zlib = require('zlib');
const fs = require('fs');

var app = new titbit({
    //daemon: true,
    bodyMaxSize: 80000000,
    debug: true,
    useLimit: true,
    //deny : ['10.7.10.149'],
    maxIPRequest: 420,
    peerTime: 1,
    cert : '../rsa/localhost-cert.pem',
    key : '../rsa/localhost-privkey.pem',
    showLoadInfo: false,
    //globalLog: true,
    logType: 'stdio',
    loadInfoFile: '/tmp/loadinfo.log',
    pageNotFound: `<!DOCTYPE html>
        <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width">
                <title>titbit - not found</title>
            </head>
            <body>
                <div style="margin-top:3.8rem;text-align:center;color:#565758;">
                    <h1>404 : page not found</h1>
                </div>
            </body>
        </html>
    `,
});

var {router} = app;

router.get('/', async ctx => {
    ctx.res.body = 'ok';
});

router.post('/p', async ctx => {
    ctx.res.body = ctx.body;
}, '@post');

router.post('/pt', async ctx => {
    ctx.res.body = ctx.body;
}, {name: 'post-test2', group: 'post'});


app.use(async (ctx, next) => {
    var start_time = Date.now();
    await next(ctx);
    var end_time = Date.now();
    var timing = end_time-start_time;
    console.log(process.pid,ctx.path, `: ${timing}ms`);
});


app.use(async (ctx, next) => {
    console.log('middleware for POST/PUT');
    await next(ctx);
    console.log('middleware for POST/PUT -- ');
}, {method: ['POST','PUT']});

app.use(async (ctx, next) => {
    console.log('a1');
    await next(ctx);
    console.log('a1');
});

app.use(async (ctx, next) => {
    console.log('a2');
    await next(ctx);
    console.log('a2');
});

app.use(async (ctx, next) => {
    console.log('a3');
    await next(ctx);
    console.log('a3');
}, {group: 'post'});

app.use(async (ctx, next) => {
    console.log('checking file');
    if (!ctx.isUpload) {
        return ;
    }
    if (!ctx.getFile('image')) {
        ctx.res.body = 'file not found, please upload with name "image" ';
        return ;
    }
    await next(ctx);
}, {name: 'upload-image'});

router.post('/upload', async c => {
    try {
        var upf = c.getFile('image');
        console.log(upf.length, upf.data.length);
        c.res.body = await c.moveFile(c.getFile('image'), {
            path : process.env.HOME + '/tmp/buffer',
        });
    } catch (err) {
        c.res.body = err.message;
    }
}, {name: 'upload-image', group: 'upload'});

app.use(async (c, next) => {
    if (c.getFile('file') === null) {
        c.res.body = 'file not found -> c.files.file';
        return ;
    }
    await next(c);

}, 'upload-file');

router.put('/upload', async c => {
    try {
        c.res.body = await c.moveFile(c.getFile('file'), {
            path: process.env.HOME+'/tmp/a'
        });
    } catch (err) {
        c.res.body = err.message;
    }
}, {name:'upload-file', group:'upload'});

router.get('/err', async ctx => {
    throw 'Error: test';
});

router.get('/app', async c => {
    if (c.app) {
        c.res.body = c.app.router.group();
    } else {
        c.res.body = 'null';
    }
});

app.use(async (c, next) => {
    c.res.setHeader('content-encoding', 'gzip');
    c.res.setHeader('content-type', 'text/plain; charset=utf-8');
    c.sesponse.writeHead(200, 'ok', c.res.headers);
    await next(c);
    let wdat = await new Promise((rv, rj) => {
        //zlib.gzip(Buffer.from(c.res.body, c.res.encoding)
        zlib.gzip(c.res.body, {encoding:'utf8'}, (err, data) => {
            if (err) {rj (err);}
            rv(data);
        });
    });
    c.stream.write(wdat);
    c.res.body = null; //最后不再返回数据。
}, {name: 'gzip-test'});

router.get('/quantum', async c => {
    c.res.body = await new Promise((rv, rj) => {
        fs.readFile('./tmp/quantum', {encoding:'utf8'}, (err, data) => {
            if (err) { rj(err); }
            rv(data);
        });
    });
}, 'gzip-test');

router.get('/router', async c => {
    c.res.body = [
        c.app.router.routeTable(),
        c.app.router.group()
    ];
});


//console.log(app.router);

app.daemon(2022, 3);

