
![-](images/motoboat_test.png)

# motoboat

基于Node.js的Web框架，使用async/await关键字解决回调地狱。

支持HTTPS，支持HTTP/1.1协议，不支持HTTP/2。若要使用HTTP/2，请使用框架awix。

motoboat通过一个被称为请求上下文的对象打包了需要的数据以及原始的请求对象（request和response）。通过请求上下文对象可以获取本次请求所有的信息。

支持功能：

* 中间件
* 路由
* 路由分组/中间件分组
* 限制请求数量
* 守护进程
* cluster集群
* 全局日志
* 显示负载情况

## 安装

`npm install motoboat`

或者git clone此仓库，然后引入motoboat.js文件。


## 示例

``` JavaScript
const mot = require('motoboat');

var app = new mot();

var {router} = app;

router.get('/', async c => {
    /*
        只需要设置c.res.data的值，就会自动返回数据，
        可以是数组，JSON，字符串，数字类型。
    */
    c.res.data = 'success';
});

app.run(8192);

```

## 请求类型

支持GET、POST、PUT、DELETE、OPTIONS请求，分别有对应的小写的方法用于添加路由。

## 处理多个路由

``` JavaScript
const mot = require('motoboat');

var app = new mot();

var {router} = app;

router.get('/', async c => {
    c.res.data = 'success';
});

router.get('/t', async c => {
    c.res.data = 'great';
});

router.post('/pt', async c => {
    c.res.data = 'This is post page';
});

app.run(8192);

```

## 获取URL参数

``` JavaScript
const mot = require('motoboat');

var app = new mot();

var {router} = app;

router.get('/', async c => {
    //URL的查询字符串（?a=1&b=2...），被解析到c.param，以JSON形式存储。
    c.res.data = c.param;
});

app.run(8192);

```

## 获取表单数据

POST或PUT请求会携带请求体数据，常见的是表单提交，也可以是上传文件，或者提交其它格式的文本。

``` JavaScript
const mot = require('motoboat');

var app = new mot();

var {router} = app;

router.get('/', async c => {
    c.res.data = 'success';
});

router.post('/pt', async c => {
    c.res.data = c.bodyparam;
});

router.put('/pu', async c => {
    c.res.data = c.bodyparam;
});

app.run(8192);

```

## 中间件

这个是框架设计的核心，实际上，请求处理过程都是中间件模式层层调用。通过中间件模式，可以把复杂的业务逻辑更好地进行分离，并进行灵活的拼接调用。中间件的工作方式可以用下图描述。

![中间件图片](images/middleware.png)

按照这样的模型设计，后添加的中间件先执行，而在返回时，则是从核心逐层向外返回。其实就是栈结构调用方式。

## 中间件示例场景

比如，需要用户登录才可以操作的接口，而在登录后，还需要验证用户权限，最后是核心业务逻辑。这样的方式可以通过两个中间件来解决，在任一层中间件检测非法则直接返回，不会穿透到核心业务。并且修改和扩展都比较方便，编写中间件和核心业务处理可以独立进行。

## 编写中间件

中间件编写的参数有固定格式，执行下一层中间件也有固定写法。

``` JavaScript

/**
 * 使用add添加中间件，中间件一定是async声明的函数，
 * 接受两个参数，c是请求上下文，next表示下一层中间件。
 * 要执行则只需要await next(c)。
 * 如果检测发现不合法需要停止向内执行，则只需要不写await next(c)
 * 
 * add同时接受第二个参数，如果不填写则表示全局执行。
 * 
 * */
serv.add(async (c, next) => {
  c.res.data += 'I am middleware';
  await next(c);
  c.res.data += 'middleware end';
}, {preg: '/mid-test'});

serv.get('/mid-test', async c => {
  c.res.data += 'This test page for middleware';
});

```

访问/mid-test返回结果：

```

I am middleware
This test page for middleware
middleware end

```

使用add接口添加中间件，接受两个参数，第一个是请求上下文，第二个next表示下一层中间件。要执行则只需要

`await next(c)`

如果检测发现不合法需要停止向内执行，则只需要不写 await next(c)。

add支持第二个参数，如果没有表示全局执行，所有的请求都会先执行此中间件，否则可以填写值如下：

* 字符串：表示组的名称，只在路由分组内添加中间件。

* JSON对象：{preg: PREG, group: GROUP}，preg表示匹配规则，group表示组名称，两个是可选项。preg的值如下：
  * 字符串：只对此路由执行。
  * 字符串数组：在其中的字符串都会执行。
  * 正则表达式：匹配后执行。

* 正则表达式或字符串数组：其实就是preg的匹配规则。全局添加。

