const mt = require('../motoboat.js');
const fs = require('fs');

aserv = new mt();

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
            rr.res.data = `${fty} : file type not allowed`;
    }
}, {preg : '/upload'});

//针对/upload2路由的中间件，单文件上传检测文件大小不能超过2M。
aserv.add(async (rr, next) => {
    console.log('checking file size');
    if (rr.getFile('image').data.length > 2000000 ) {
        rr.res.data = 'Error: image size too large';
    } else {
        await next(rr);
    }

}, {preg: '/upload'});

//检测文件是否存在
aserv.add(async (rr, next) => {
    console.log('checking upload file');
    if (!rr.isUpload || rr.getFile('image') === null) {
        rr.res.data = 'Error: file not found';
    } else {
        await next(rr);
    }
}, {preg: '/upload'});


router.get('/', async rr => {
    rr.res.data = 'ok';
});

router.post('/pt', async rr => {
    rr.res.data = rr.bodyparam;
});

router.post('/upload', async rr => {
    var imgpath = process.env.HOME + '/node/upload/image';
    var f = rr.getFile('image');
    if (f) {
        try {
            rr.res.data = await rr.helper.moveFile(f,{
                path : imgpath,
            });
        }
        catch(err) {
            console.log(err);
            rr.res.data = 'error';
        }
    } else {
        rr.res.data = 'Error: file not found';
    }
});

aserv.daemon(2020);
