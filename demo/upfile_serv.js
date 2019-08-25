const mt = require('../main.js');
const fs = require('fs');

aserv = new mt({
    cert: '../rsa/localhost-cert.pem',
    key:  '../rsa/localhost-privkey.pem',
    useLimit: true,
    //https: true,
});

var {router} = aserv;

aserv.add(async (rr, next) => {
    console.log('checking file type');
    var fty = rr.getFile('image')['content-type'];
    switch(fty) {
        case 'image/png':
        case 'image/jpg':
        case 'image/jpeg':
        case 'image/gif':
            await next(rr);
            break;
        default:
            rr.res.body = `${fty} : file type not allowed`;
    }
}, {name: 'upload-image'});

//针对/upload2路由的中间件，单文件上传检测文件大小不能超过2M。
aserv.add(async (rr, next) => {
    console.log('checking file size');
    if (rr.getFile('image').data.length > 2000000 ) {
        rr.res.body = 'Error: image size too large';
    } else {
        await next(rr);
    }

}, {name: 'upload-image'});

//检测文件是否存在
aserv.add(async (rr, next) => {
    console.log('checking upload file');
    if (!rr.isUpload || rr.getFile('image') === null) {
        rr.res.body = 'Error: file not found';
    } else {
        await next(rr);
    }
}, {name: 'upload-image'});


router.get('/', async rr => {
    rr.res.body = 'ok';
});

router.post('/p', async rr => {
    rr.res.body = rr.body;
});

router.post('/upload', async rr => {
    var imgpath = process.env.HOME + '/node/upload/image';
    var f = rr.getFile('image');
    if (f) {
        try {
            rr.res.body = await rr.helper.moveFile(f,{
                path : imgpath,
            });
        }
        catch(err) {
            console.log(err);
            rr.res.body = 'error';
        }
    } else {
        rr.res.body = 'Error: file not found';
    }
}, 'upload-image');

aserv.daemon(2021, 2);
