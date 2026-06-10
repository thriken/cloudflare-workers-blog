这个文件是我fork来的额外备注信息：

此项目fork自[https://github.com/gdtool/cloudflare-workers-blog](https://github.com/gdtool/cloudflare-workers-blog)

项目搭建在cloudflare workers上,使用cloudflare KV作为数据库,无其他依赖.

index.js 为worker入口文件,前面是一些配置，可以根据需求修改，后面是一些路由处理，一般不建议更改。（我更改了主题路径到我自己的库）

themes文件夹时主题文件夹，其中default2.0是默认主题，但是这个主题依赖于default的静态文件，所以default也必须存在。

主题模板文件中一些静态资源已经是cdn地址，少量资源可以根据需要修改，比如我把主题修改了，那么应该引用我需要的静态资源。

主题修改准备：
一、简单修改为自适应主题
1.1 主要修改new2.0/中的文件[源自default2.0]
1.2 如果需要修改css，采用复制并修改的方式，保留原有css文件，修改复制的css文件

二、采用github源码提交后自动部署