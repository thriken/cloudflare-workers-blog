'use strict';
const OPT = {
    "user" : "***", //后台密码
    "password" : "***", //后台密码
    "siteDomain" : "blog.gezhong.vip",// 域名 
    "privateBlog": false, //is a private Blog?设置为true 阻止公开访问
    "siteName" : "CF workers blog",//博客名称
    "siteDescription":"A Blog Run On Cloudflare Workers and KV",//博客描述
    "keyWords":"cloudflare,KV,workers,blog",
    "pageSize" : 5,//每页文章数
    "recentlySize" : 3,//最近文章数
    "readMoreLength":150,//阅读更多截取长度
    "cacheZoneId":"cc858e8edce4097ad4a7357442722897",//清理缓存用 区域 ID
    "cacheToken":"LNxRWH-MPMIGnp8qhyT8FUsjDRN6tdOnm7B5Mdrz",//清理缓存用 API token
    "cacheTime" : 60, //网页缓存时长(秒),建议=文章更新频率
    "widgetOther":`
<div id="linkcat-0" class="widget widget_links">
	<h3 class="widget-title">
		<span>最近评论</span></h3>
	<div id="waline-recent"></div>
	<script>
		window.addEventListener('load', function() {
		  Waline.Widget.RecentComments({
			el: '#waline-recent',
			serverURL: 'https://pinglun.vercel.app',
			count: 10
		  });
		});
	</script>
</div>
    `,
    "themeURL" : "https://raw.githubusercontent.com/gdtool/cloudflare-workers-blog/master/themes/JustNews/", // 模板地址,以 "/"" 结尾default2.0
    "html404" : `<h1>404</h1>`,//404页面返回
    "codeBeforHead":`
    <link rel="icon" type="image/x-icon" href="https://cdn.jsdelivr.net/gh/gdtool/zhaopp/cfblog/favicon.ico" />
<link rel="Shortcut Icon" href="https://cdn.jsdelivr.net/gh/gdtool/zhaopp/cfblog/favicon.ico">
    <script src='//cdn.jsdelivr.net/npm/@waline/client/dist/Waline.min.js'></script>

    <script data-ad-client="ca-pub-0224824489587078" async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>
    `,//其他代码,显示在</head>前
    "codeBeforBody":`
        <script>
            new Waline({
                el:'#waline',
                serverURL: 'https://pinglun.vercel.app',
                appId: 'eWrOzSzYP1Fm8QDx96P0vKli-MdYXbMMI',
                appKey: 'jMF98EwbmKvdGnDLamPwsAk1',
                avatar:'monsterid',
                recordIP:false,
                requiredFields:['nick'],
                visitor: true,
                //path:"/",
                placeholder:"整两句..."
            })
        </script>
        <script>
            //hljs.initHighlightingOnLoad();
            var _hmt = _hmt || [];
            (function() {
            var hm = document.createElement("script");
            hm.src = "https://hm.baidu.com/hm.js?3c82d815b755ee9b789cb004067c1fc7";
            var s = document.getElementsByTagName("script")[0]; 
            s.parentNode.insertBefore(hm, s);
            })();
        </script>
    `,//其他代码,显示在</body>前
    "commentCode":`
        <div id="waline"  name="waline" class="comments-area"></div>

    `,//评论区代码
    "otherCodeA":"阅读:",//默认模板,建议设置为 "阅读次数:"四个大字
    "otherCodeB":"",
    "otherCodeC":"",
    "otherCodeD":"",
    "otherCodeE":"",
    "copyRight" :`Powered by <a href="https://www.cloudflare.com">Cloudflare</a> & <a href="https://blog.gezhong.vip">CF-Blog </a>`,//版权信息
"robots":`User-agent: *
Disallow: /admin`//robots.txt设置
};

const Mustache = require('mustache');
addEventListener('fetch', event => {event.respondWith(handleRequest(event))});
//主函数
async function handleRequest(event) {
    let request = event.request;
    let url = new URL(event.request.url);
    //私人博客
    if(OPT.privateBlog == undefined)
        OPT.privateBlog=false
    //密码认证
    let path = url.pathname.trim("/").split('/'); //转为小写,拆分路径
    if(path[0] === 'admin' || OPT.privateBlog === true){
        if ( !doBasicAuth(event.request)) {
            return unauthorized();
        }
    }
    //备份导出
    if(path[0] === 'admin' && path[1] === "export"){
        let kvs = await getKVKeys();
        return new Response(JSON.stringify(kvs), {
            headers: {'content-type': 'application/octet-stream;charset=utf-8',
                    'Content-Disposition': 'attachment; filename=cfblog-'+getCurrentTime()+'.json'
            },
        })
    }
    console.log(url.pathname);
    //自定义主题(用于预览)
    let theme = url.searchParams.get('theme');
    let pageSize = url.searchParams.get('pageSize');
    
    if(theme){
        OPT.themeURL = "https://raw.githubusercontent.com/gdtool/cloudflare-workers-blog/master/themes/" + theme + '/'
    }
    if(pageSize){
        OPT.pageSize =parseInt(pageSize)
    }
    if(OPT.themeURL == "https://raw.githubusercontent.com/gdtool/cloudflare-workers-blog/master/themes/default/"){
        OPT.themeURL = "https://raw.githubusercontent.com/gdtool/cloudflare-workers-blog/master/themes/default2.0/"
    }
    console.log("theme pageSize", OPT.pageSize,OPT.themeURL);
    // 处理/robots.txt
    if(url.pathname=="/robots.txt"){
        return new Response(OPT.robots + '\nSitemap: https://'+ OPT.siteDomain + "/sitemap.xml", {
            headers: {  
              "content-type": "text/plain;charset=UTF-8",
            },
            status: 200
        })  
    }
    //favicon.ico
    if(url.pathname=="/favicon.ico"){
        return new Response("404", { 
            headers: {  
              "content-type": "text/plain;charset=UTF-8",
            },
            status: 404
        })  
    }

    //缓存开始
    
    
    let pathA = '';//参数A:[page,category,tags,single,search]
    let pathB = '';//参数B
    let pathC = '';//参数C
    //如果是首页
    if(path.length ==0 || path[0]==""){
        pathA = 'page';
        pathB = '1';
    }
    else{ //两个以上参数
        pathA = path[0];
        pathB = (path[1] === undefined ? 1 : path[1] );
        pathC = (path[2] === undefined ? 1 : path[2] );

    }
    const cache = caches.default
    //const cacheUrl = new URL(request.url)
    
    //设置缓存域名
    //cacheUrl.hostname = OPT.siteDomain
    //缓存路径
    const cacheFullPath = "https://"+OPT.siteDomain + '/' +pathA+ '/' +pathB+ '/' +pathC ;
    const cacheKey = new Request(cacheFullPath , request)
    console.log("cacheFullPath:",cacheFullPath);
    //console.log("url.toString():",url.toString());
    //去找是否存在缓存
    let response = await cache.match(cacheKey)
    //如果存在缓存直接返回
    if (!!response) {
        //console.log("hit cache=============",cacheFullPath);
        return response;
    }
    //缓存结束
    
    //sitemap.xml
    if(pathA=="sitemap.xml"){
        
        response= new Response( await getSiteMap(), {
            headers: {  
              "content-type": "text/xml;charset=UTF-8",
            },
            status: 200
        })  
    }
    else{
        //const cache = caches.default; // Cloudflare edge caching
            //console.log(request);
        //处理html正文
        let html = await getHtml(event.request);
        response =  new Response(html, { 
            headers: {  
              "content-type": "text/html;charset=UTF-8",
            },
            status: 200
        })
        
    }
    //1.开启缓存
    if(pathA == 'admin')
        response.headers.set('Cache-Control', "no-store");
    else {
        response.headers.set('Cache-Control', "public, max-age=" + OPT.cacheTime);
        //2.存入缓存 ,一定要存 cacheFullPath的
        event.waitUntil(cache.put(cacheFullPath, response.clone()));
    }
    
    return response;
}

//入口判断router
async function getHtml(request) {
    let url = new URL(request.url);

    let path = url.pathname.trim("/").split('/'); //转为小写,拆分路径
    let pathA = '';//参数A:[page,category,tags,single,search]
    let pathB = '';//参数B
    let pathC = '';//参数C
    //如果是首页
    if(path.length ==0 || path[0]==""){
        pathA = 'page';
        pathB = '1';
    }
    else{ //两个以上参数
        pathA = path[0];
        pathB = (path[1] === undefined ? 1 : path[1] );
        pathC = (path[2] === undefined ? 1 : path[2] );

    }

    //console.log("进入函数getHtml",pathA,pathB,pathC);
    //开始判断方法
    if(pathA == 'page' && parseInt( pathB ) > 0 ){//返回一个文章列表页面
        return await GetHtmlPageNew(pathA,parseInt(pathB));
    }
    else if(pathA == 'category' &&  pathB.length>0 ){
        return await GetHtmlTagsNew(pathA,pathB,parseInt(pathC));
    }

    else if(pathA == 'tags' &&  pathB.length>0 ){
        return await GetHtmlTagsNew(pathA,pathB,parseInt(pathC));
    }
    else if(pathA == 'article' && pathB.length>0){
       return await GetHtmlSingleNew(pathA,pathB);
    }
    else if(pathA == 'search'){
        
    }else if(pathA == 'admin'){
        return await GetHtmlAdmin(request,path);
    }
    else {
        return OPT.html404;
    }
    return OPT.html404;
}
//单一文章
async function GetHtmlSingleNew(pathA,pathB,pathC){
    //pathB=decodeURI(pathB)
    //console.log("进入函数GetHtmlPage");
    //html = themepage.replace(GetHtmlMenu,GetHtmlArticle,GetHtmlRecently,GetHtmlCategory,GetHtmlTags)
    //获取模板
    
    let themeIndex =await getTheme('article'); //主模板
    //获取mueme
    let widgetMenuList = await getKVByKey("SYSTEM_VALUE_WidgetMenu",true)  ;
    //获取分类
    let widgetCategoryList =  await getKVByKey("SYSTEM_VALUE_WidgetCategory",true);
    //获取标签
    let widgetTagsList = await getKVByKey("SYSTEM_VALUE_WidgetTags",true);
    //获取友情链接
    let widgetLinkList =  await getKVByKey("SYSTEM_VALUE_WidgetLink",true);
    //获取所有文章
    let articleListAll  = await getKVByKey("SYSTEM_INDEX_LIST",true);
    //获取最近文章
    let widgetRecentlyList = articleListAll.slice(0,OPT.recentlySize) ;
    for (var i = 0; i < widgetRecentlyList.length; i++) {
        widgetRecentlyList[i].createDate10 =widgetRecentlyList[i].createDate.substr(0,10)
        widgetRecentlyList[i].url ="/article/"+widgetRecentlyList[i].id+"/"+(widgetRecentlyList[i].link === undefined ? 'detail': widgetRecentlyList[i].link)+'.html'
    }
    ////////////////////////////////////////////开始有变化///////////////////////////////////
    //获取单篇文章 以及上下文
    let jsonArticleSingleArray = await getKVArticleSingle(pathB);//page = pathB
    for (var i = 0; i < jsonArticleSingleArray.length; i++) {
        if(!!jsonArticleSingleArray[i]){
            jsonArticleSingleArray[i].createDate10 =jsonArticleSingleArray[i].createDate.substr(0,10)
            jsonArticleSingleArray[i].contentLength =jsonArticleSingleArray[i].contentText.length
            jsonArticleSingleArray[i].url ="/article/"+jsonArticleSingleArray[i].id+"/"+(jsonArticleSingleArray[i].link === undefined ? 'detail': jsonArticleSingleArray[i].link)+'.html'
        }
    }
    //console.log("jsonArticleSingleArray-------------------:",typeof jsonArticleSingleArray,JSON.stringify(jsonArticleSingleArray));
    let articleSingle = jsonArticleSingleArray[1]
    if (articleSingle){
        articleSingle.createDate10 = articleSingle.createDate.substr(0,10)
        articleSingle.createDateYear = articleSingle.createDate.substr(0,4)
        articleSingle.createDateMonth = articleSingle.createDate.substr(5,7)
        articleSingle.createDateDay = articleSingle.createDate.substr(8,10)
        articleSingle.contentLength =articleSingle.contentText.length
    }
    let articleNewer = []
    let articleOlder = []
    if(jsonArticleSingleArray[0])
        articleNewer.push(jsonArticleSingleArray[0])
    if(jsonArticleSingleArray[2])
        articleOlder.push(jsonArticleSingleArray[2])
    // //获取title
    let title = articleSingle.title + ' - ' + OPT.siteName ;
    // //获取keyWords
    let keyWords = articleSingle.tags.concat(articleSingle.category).join(",") ;
    let viewObject = {};
    viewObject.widgetMenuList=widgetMenuList;
    viewObject.widgetCategoryList =widgetCategoryList ;
    viewObject.widgetTagsList =widgetTagsList ;
    viewObject.widgetLinkList =widgetLinkList ;
    viewObject.widgetRecentlyList =widgetRecentlyList ;
    viewObject.articleSingle =articleSingle ;
    viewObject.articleNewer =articleNewer ;
    viewObject.articleOlder =articleOlder ;
    viewObject.title =title ;
    viewObject.keyWords =keyWords ;
    let optTemp = Object.assign({}, OPT);//JSON.parse(JSON.stringify(OPT));
    optTemp.password='';
    optTemp.user='';
    optTemp.cacheToken='';
    optTemp.cacheZoneId='';
    viewObject.OPT =optTemp ;
    //console.log("-----viewObject----- ",JSON.stringify(viewObject));
    return   Mustache.render(themeIndex, viewObject);
    
}

//标签+分类 
async function GetHtmlTagsNew(pathA,pathB,pathC){
    pathB=decodeURI(pathB)
    //console.log("进入函数GetHtmlPage");
    //html = themepage.replace(GetHtmlMenu,GetHtmlArticle,GetHtmlRecently,GetHtmlCategory,GetHtmlTags)
    //获取模板
    
    let themeIndex =await getTheme('index'); //主模板
    //获取mueme
    let widgetMenuList = await getKVByKey("SYSTEM_VALUE_WidgetMenu",true)  ;
    //获取分类
    let widgetCategoryList =  await getKVByKey("SYSTEM_VALUE_WidgetCategory",true);
    //获取标签
    let widgetTagsList = await getKVByKey("SYSTEM_VALUE_WidgetTags",true);
    //获取友情链接
    let widgetLinkList =  await getKVByKey("SYSTEM_VALUE_WidgetLink",true);
    //获取所有文章
    let articleListAll  = await getKVByKey("SYSTEM_INDEX_LIST",true);
    //获取最近文章
    let widgetRecentlyList = articleListAll.slice(0,OPT.recentlySize) ;
    for (var i = 0; i < widgetRecentlyList.length; i++) {
        widgetRecentlyList[i].createDate10 =widgetRecentlyList[i].createDate.substr(0,10)
        widgetRecentlyList[i].url ="/article/"+widgetRecentlyList[i].id+"/"+widgetRecentlyList[i].link+'.html'
    }
    ////////////////////////////////////////////开始有变化///////////////////////////////////
    //获取本页文章
    let jsonArticleListArray = await getKVArticleCategory(pathB,pathC);//关键字,页码
    let articleList = jsonArticleListArray[0]
    let isEnd = jsonArticleListArray[1]

    for (var i = 0; i < articleList.length; i++) {
        articleList[i].createDate10 =articleList[i].createDate.substr(0,10)
        articleList[i].createDateYear = articleList[i].createDate.substr(0,4)
        articleList[i].createDateMonth = articleList[i].createDate.substr(5,7)
        articleList[i].createDateDay = articleList[i].createDate.substr(8,10)
        articleList[i].contentLength =articleList[i].contentText.length
        articleList[i].url ="/article/"+articleList[i].id+"/"+articleList[i].link+'.html'
    }
    //获取pageNewer +1
    let pageNewer  = [ { title:"上一页",url: "/"+pathA+"/"+pathB+"/"+ (pathC-1)} ] ;
    if(pathC == 1)
        pageNewer = [];
    //获取pageOlder
    let pageOlder  = [ { title:"下一页",url: "/"+pathA+"/"+pathB+"/"+ (pathC+1)} ] ; 
    if(isEnd)
        pageOlder = [];
    // //获取title
    let title = pathB+ ' - ' + OPT.siteName ;
    // //获取keyWords
    let keyWords = pathB ;
    let viewObject = {};
    viewObject.widgetMenuList=widgetMenuList;
    viewObject.widgetCategoryList =widgetCategoryList ;
    viewObject.widgetTagsList =widgetTagsList ;
    viewObject.widgetLinkList =widgetLinkList ;
    viewObject.widgetRecentlyList =widgetRecentlyList ;
    viewObject.articleList =articleList ;
    viewObject.pageNewer =pageNewer ;
    viewObject.pageOlder =pageOlder ;
    viewObject.title =title ;
    viewObject.keyWords =keyWords ;
    let optTemp =Object.assign({}, OPT);
    optTemp.password='';
    optTemp.user='';
    optTemp.cacheToken='';
    optTemp.cacheZoneId='';
    viewObject.OPT =optTemp ;
    //console.log("-----viewObject----- ",JSON.stringify(viewObject));
    return   Mustache.render(themeIndex, viewObject);
    
}


//page的htmlNew
async function GetHtmlPageNew(pathA,pathB){
    //console.log("进入函数GetHtmlPage");
    //html = themepage.replace(GetHtmlMenu,GetHtmlArticle,GetHtmlRecently,GetHtmlCategory,GetHtmlTags)
    //获取模板
    
    let themeIndex =await getTheme('index'); //主模板
    //获取mueme
    let widgetMenuList = await getKVByKey("SYSTEM_VALUE_WidgetMenu",true)  ;
    //获取分类
    let widgetCategoryList =  await getKVByKey("SYSTEM_VALUE_WidgetCategory",true);
    //获取标签
    let widgetTagsList = await getKVByKey("SYSTEM_VALUE_WidgetTags",true);
    //获取友情链接
    let widgetLinkList =  await getKVByKey("SYSTEM_VALUE_WidgetLink",true);
    //获取所有文章
    let articleListAll  = await getKVByKey("SYSTEM_INDEX_LIST",true);
    //获取最近文章
    let widgetRecentlyList = articleListAll.slice(0,OPT.recentlySize) ;
    for (var i = 0; i < widgetRecentlyList.length; i++) {
        widgetRecentlyList[i].createDate10 =widgetRecentlyList[i].createDate.substr(0,10)
        widgetRecentlyList[i].url ="/article/"+widgetRecentlyList[i].id+"/"+widgetRecentlyList[i].link+'.html'
    }
    ////////////////////////////////////////////开始有变化///////////////////////////////////
    //获取本页文章
    let articleList = articleListAll.slice( (pathB-1) * OPT.pageSize  , pathB * OPT.pageSize);
    for (var i = 0; i < articleList.length; i++) {
        articleList[i].createDate10 =articleList[i].createDate.substr(0,10)
        articleList[i].createDateYear = articleList[i].createDate.substr(0,4)
        articleList[i].createDateMonth = articleList[i].createDate.substr(5,7)
        articleList[i].createDateDay = articleList[i].createDate.substr(8,10)
        articleList[i].contentLength =articleList[i].contentText.length
        articleList[i].url ="/article/"+articleList[i].id+"/"+articleList[i].link+'.html'
    }
    //获取pageNewer +1
    let pageNewer  = [ { title:"上一页",url: "/page/"+ (pathB - 1)} ] ;
    if(pathB == 1)
        pageNewer = [];
    //获取pageOlder
    let pageOlder  = [ { title:"下一页",url: "/page/"+ (pathB + 1)} ] ; 
    if(pathB * OPT.pageSize >= articleListAll.length)
        pageOlder = [];
    // //获取title
    let title = (pathB> 1 ? 'page ' + pathB + ' - ' : '') + OPT.siteName ;
    // //获取keyWords
    let keyWords = OPT.keyWords ;
    let viewObject = {};
    viewObject.widgetMenuList=widgetMenuList;
    viewObject.widgetCategoryList =widgetCategoryList ;
    viewObject.widgetTagsList =widgetTagsList ;
    viewObject.widgetLinkList =widgetLinkList ;
    viewObject.widgetRecentlyList =widgetRecentlyList ;
    viewObject.articleList =articleList ;
    viewObject.pageNewer =pageNewer ;
    viewObject.pageOlder =pageOlder ;
    viewObject.title =title ;
    viewObject.keyWords =keyWords ;
    let optTemp = Object.assign({}, OPT);
    optTemp.password='';
    optTemp.user='';
    optTemp.cacheToken='';
    optTemp.cacheZoneId='';
    viewObject.OPT =optTemp ;
    //console.log("-----viewObject----- ",JSON.stringify(viewObject));
    return   Mustache.render(themeIndex, viewObject);
    
}


//admin页面的html
async function GetHtmlAdmin(request,path){
    // if (request.method === "POST"){
    //     const postData = await readRequestBody(request);
    //     //console.log("获取 postData ",JSON.stringify(postData));
    //     return 'testing';
    // }
    
    let url = new URL(request.url);
    //console.log("进入函数 GetHtmlAdmin ",path);
    //如果是首页
    if (path.length == 1 || path[1]=="list"){
        let themeIndex = await getTheme('admin/index'); //主模板
        //替换连个json categoryJson menuJson 
        let categoryJson =await getKVByKey("SYSTEM_VALUE_WidgetCategory",true);
        let menuJson =await getKVByKey("SYSTEM_VALUE_WidgetMenu",true);
        let linkJson =await getKVByKey("SYSTEM_VALUE_WidgetLink",true);
        //console.log(" categoryJson ",typeof categoryJson,categoryJson.toString());
        return themeIndex.r("categoryJson",JSON.stringify(categoryJson))
                         .r("menuJson",JSON.stringify(menuJson))
                         .r("linkJson",JSON.stringify(linkJson))
    }
    //发布事件
    if(path[1]=="publish"){
        //重新梳理控件参数 
        //SYSTEM_VALUE_WidgetCategory //设置的不处理
        //SYSTEM_VALUE_WidgetMenu //设置的不处理
        //SYSTEM_VALUE_WidgetTags //从索引提取的
            //提取所有index
        let jsonIndex = await getKVByKey("SYSTEM_INDEX_LIST",true);
        let jsonTags = [];
        //提取tag到变量
        for (var i = 0; i < jsonIndex.length; i++) {
            if(typeof jsonIndex[i].tags === "object"){
                for (var y = 0; y < jsonIndex[i].tags.length; y++) {
                  if (jsonTags.indexOf(jsonIndex[i].tags[y]) == -1 ) {
                    jsonTags.push(jsonIndex[i].tags[y])
                  }
                }
            }
            
        }
        await putKV("SYSTEM_VALUE_WidgetTags",JSON.stringify(jsonTags));
        //缓存控件html到数据库
        // await GetHtmlWidgetRecently("saveToKV",1); //SYSTEM_CACHE_HtmlWidgetRecently
        // await GetHtmlWidgetCategory("saveToKV",1);//SYSTEM_CACHE_HtmlWidgetCategory
        // await GetHtmlWidgetMenu("saveToKV",1);//SYSTEM_CACHE_HtmlWidgetMenu
        // await GetHtmlWidgetTags("saveToKV",1);//SYSTEM_CACHE_HtmlWidgetTags
        //清理缓存
        let cacheRST= await purgeCache();
        if (cacheRST)
            return  `{"msg":"published ,purge Cache true","rst":true}`;
        else
            return  `{"msg":"published ,buuuuuuuuuuuut purge Cache false !!!!!!","rst":true}`;
        
    }
    //获取文章列表
    if(path[1]=="getList"){
        let page = ( path[2] === undefined ? 1 : parseInt(path[2]) );
        let jsonArticleListArray = await getKVArticleIndex(page,20);//page = pathB
        return JSON.stringify(jsonArticleListArray[0])
        
    }
    //进编辑页面
    if(path[1]=="edit"){
        let articleId = path[2] ;
        let themeIndex =await getTheme('admin/edit'); //主模板
        //替换连个json categoryJson menuJson 
        let categoryJson =await getKVByKey("SYSTEM_VALUE_WidgetCategory");
        //let menuJson =await getKVByKey("SYSTEM_VALUE_WidgetMenu");
        let articleJson = await getKVByKey(articleId);
        //console.log(" categoryJson ",typeof categoryJson,categoryJson.toString());
        return themeIndex.r("categoryJson",categoryJson)
                         //.r("menuJson",menuJson)
                         .r("articleJson", articleJson.replaceAll( "script>" ,"script＞"))
    }

    //保存设置
    if(path[1]=="saveConfig"){
        const postData = await readRequestBody(request);
        let WidgetCategory=postData.WidgetCategory;//url.searchParams.get('WidgetCategory');
        //console.log(typeof WidgetCategory,WidgetCategory);
        let WidgetMenu=postData.WidgetMenu;//url.searchParams.get('WidgetMenu');
        let WidgetLink=postData.WidgetLink;//url.searchParams.get('WidgetMenu');
        //console.log(typeof WidgetMenu,WidgetMenu);
        //如果是json,保存到数据库
        if(isJSON(WidgetCategory) && isJSON(WidgetMenu) )
        {
            await putKV("SYSTEM_VALUE_" + "WidgetCategory",WidgetCategory);
            await putKV("SYSTEM_VALUE_" + "WidgetMenu",WidgetMenu);
            await putKV("SYSTEM_VALUE_" + "WidgetLink",WidgetLink);
            return  `{"msg":"saved","rst":true}`   ;
        }
        else
            return  `{"msg":"Not a JSON object","rst":false}`   ;
    }
    //导入
    if(path[1]=="import"){
        const postData = await readRequestBody(request);
        let importJson=postData.importJson;//url.searchParams.get('WidgetCategory');
        if(isJSON(importJson) )
        {
            let keys = Object.keys(importJson)
            for(let i = 0; i < keys.length; ++i) {
                //console.log(keys[i],importJson[keys[i]]);
                await putKV(keys[i],importJson[keys[i]]);
            }
            return  `{"msg":"import success!","rst":true}`   ;
        }
        else
            return  `{"msg":" importJson Not a JSON object","rst":false}`   ;
    }
    //新建文章
    if(path[1]=="saveAddNew"){
        const postData = await readRequestBody(request);
        let title=postData.title;        //url.searchParams.get('title');
        let img=postData.img;          //url.searchParams.get('img');
        let link=postData.link;         //url.searchParams.get('link');
        let createDate=postData.createDate;   //url.searchParams.get('createDate');
        let category=postData.category;     //getCategory(decodeURI(url)); //这个reshuffle
        let tags=postData.tags;         //url.searchParams.get('tags').split(',');
        let priority=(postData.priority === undefined ? "0.5":postData.priority) ;         //权重
        let changefreq=(postData.changefreq === undefined ? "daily":postData.changefreq);         //更新频率
        let contentMD=postData["content-markdown-doc"];    //url.searchParams.get('content-markdown-doc');
        let contentHtml=postData["content-html-code"];  //url.searchParams.get('content-html-code');
        let contentText ='';
        let id = '';
        if(title.length>0 && createDate.length>0 && category.length>0 && contentMD.length>0 && contentHtml.length>0 ){
            id = await getKVNewId();
            contentText = contentHtml.replace(/<\/?[^>]*>/g, '').trim().substring(0,OPT.readMoreLength);
            let articleFull = {
                "id":id,
                "title":title,
                "img": img,
                "link": link,
                "createDate": createDate,
                "category": category,
                "tags": tags,
                "contentMD": contentMD,
                "contentHtml": contentHtml,
                "contentText": contentText,
                "priority":priority,
                "changefreq":changefreq
            }
            //全文写入数据库
            await putKV(id,JSON.stringify(articleFull));//JSON.stringify(articleFull)
            let articleSimpel = {
                "id":id,
                "title":title,
                "img": img,
                "link": link,
                "createDate": createDate,
                "category": category,
                "tags": tags,
                "contentText": contentText,
                "priority":priority,
                "changefreq":changefreq
            }
            //index也要建立SYSTEM_INDEX_LIST
            let oldIndex = await getKVByKey("SYSTEM_INDEX_LIST",true);
            let newIndex =[];
            newIndex.push(articleSimpel);
            newIndex = newIndex.concat(oldIndex);
            newIndex = sortByKey(newIndex,"id")
            //这里要排个序
            await putKV("SYSTEM_INDEX_LIST",JSON.stringify(newIndex));
             //console.log("insert ID ",id);
            return  '{"msg":"added OK","rst":true,"id":"'+id+'"}';
        }
        else{
            return  `{"msg":"信息不全","rst":false}`;
        }
        return  `{"msg":"some error ","rst":false}`   ;
    }
    //删除文章
    if(path[1]=="delete"){
        let articleId = path[2] ;
        if(articleId.length == 6){
            await CFBLOG.delete(articleId);
            //index也要重新建立,一定要准,后面不在重构 SYSTEM_INDEX_LIST
            //获取旧索引
            let oldIndex = await getKVByKey("SYSTEM_INDEX_LIST",true);
            //删掉当前文章
            for (var i = 0; i < oldIndex.length; i++) {
                if (articleId == oldIndex[i].id) {
                    //console.log(user.userInfo[i])
                    oldIndex.splice(i, 1);
                }
            }
            //写入索引数据库
            await putKV("SYSTEM_INDEX_LIST",JSON.stringify(oldIndex));
            return  '{"msg":"Delete ('+articleId+')  OK","rst":true,"id":"'+articleId+'"}';
        }
        else{ return '{"msg":"Delete  false ","rst":false,"id":"'+articleId+'"}';}
    }
    //编辑文章
    if(path[1]=="saveEdit"){
        const postData = await readRequestBody(request);
        let title=postData.title;        //url.searchParams.get('title');
        let img=postData.img;          //url.searchParams.get('img');
        let link=postData.link;         //url.searchParams.get('link');
        let createDate=postData.createDate;   //url.searchParams.get('createDate');
        let category=postData.category;     //getCategory(decodeURI(url)); //这个reshuffle
        let tags=postData.tags;         //url.searchParams.get('tags').split(',');
        let contentMD=postData["content-markdown-doc"];    //url.searchParams.get('content-markdown-doc');
        let contentHtml=postData["content-html-code"];  //url.searchParams.get('content-html-code');
        let priority=(postData.priority === undefined ? "0.5":postData.priority) ;         //权重
        let changefreq=(postData.changefreq === undefined ? "daily":postData.changefreq);         //更新频率
        let contentText ='';
        let id = postData.id;

        if(title.length>0 && createDate.length>0 && category.length>0 && contentMD.length>0 && contentHtml.length>0 ){
            //去html标签
            contentText = contentHtml.replace(/<\/?[^>]*>/g, '').trim().substring(0,OPT.readMoreLength);
            let articleFull = {
                "id":id,
                "title":title,
                "img": img,
                "link": link,
                "createDate": createDate,
                "category": category,
                "tags": tags,
                "contentMD": contentMD,
                "contentHtml": contentHtml,
                "contentText": contentText,
                "priority":priority,
                "changefreq":changefreq
            }
            //全文写入数据库
            await putKV(id,JSON.stringify(articleFull));//JSON.stringify(articleFull)
            let articleSimpel = {
                "id":id,
                "title":title,
                "img": img,
                "link": link,
                "createDate": createDate,
                "category": category,
                "tags": tags,
                "contentText": contentText,
                "priority":priority,
                "changefreq":changefreq
            }
            //index也要重新建立,一定要准,后面不在重构 SYSTEM_INDEX_LIST
            //获取旧索引
            let oldIndex = await getKVByKey("SYSTEM_INDEX_LIST",true);
            //删掉当前文章
            for (var i = 0; i < oldIndex.length; i++) {
                if (id == oldIndex[i].id) {
                    //console.log(user.userInfo[i])
                    oldIndex.splice(i, 1);
                }
            }
            
            //加入编辑后的文章
            oldIndex.push(articleSimpel);
            //重新排序
            oldIndex = sortByKey(oldIndex,"id")
            //写入索引数据库
            await putKV("SYSTEM_INDEX_LIST",JSON.stringify(oldIndex));
             //console.log("insert ID ",id);
            return  '{"msg":"Edit OK","rst":true,"id":"'+id+'"}';
        }
        else{
            return  `{"msg":"信息不全","rst":false}`;
        }
        //如果是json,保存到数据库
        // if(isJSON(WidgetCategory) && isJSON(WidgetMenu))
        // {
        //     await putKV("SYSTEM_VALUE_" + "WidgetCategory",WidgetCategory);
        //     await putKV("SYSTEM_VALUE_" + "WidgetMenu",WidgetMenu);
        //     return  `{"msg":"saved","rst":true}`   ;
        // }
        // else
        
    }
    return  `{"msg":"some errors","rst":false}`   ;
}

//getSiteMap
async function getSiteMap(){
    console.log("进入函数 getSiteMap");

    let ArticleAll = await getKVByKey("SYSTEM_INDEX_LIST",true);
    //console.log("ArticleAll-------------------:", ArticleAll);
    //从ALL里面,搜出包含关键字的
    let siteMap  = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd" xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    for(var i = 0 , l=ArticleAll.length;i<l;i++){
        siteMap +=  '\n\t' + "<url>";
        siteMap +=  '\n\t\t' + "<loc>"+  "https://"+OPT.siteDomain+"/article/"+ArticleAll[i].id+"/"+ArticleAll[i].link+'.html'  +"</loc>";
        siteMap +=  '\n\t\t' + "<lastmod>"+ ArticleAll[i].createDate.substr(0,10)  +"</lastmod>";
        siteMap +=  '\n\t\t' + "<changefreq>"+  (ArticleAll[i].changefreq === undefined ? "daily":ArticleAll[i].changefreq)  +"</changefreq>";
        siteMap +=  '\n\t\t' + "<priority>"+  (ArticleAll[i].priority === undefined ? "0.5":ArticleAll[i].priority)   +"</priority>";
        siteMap +=  '\n\t' + "</url>";
   
    }
    siteMap +=  '\n' + "</urlset>";
    return siteMap
    
}
//单页的html
async function GetHtmlSingle(pathA,pathB){
    //console.log("进入函数 GetHtmlSingle");
    //html = themepage.replace(GetHtmlMenu,GetHtmlArticle,GetHtmlRecently,GetHtmlCategory,GetHtmlTags)
    let themeIndex =await getTheme('index'); //主模板
    let htmlWidgetMenu = await GetHtmlWidgetMenu(pathA,pathB); //GetHtmlMenu
    let htmlWidgetCategory = await GetHtmlWidgetCategory(pathA,pathB); //GetHtmlMenu
    let htmlWidgetTags = await GetHtmlWidgetTags(pathA,pathB); //GetHtmlMenu
    let htmlWidgetRecently = await GetHtmlWidgetRecently(pathA,pathB); //GetHtmlMenu
    
    let [htmlArticleSingle,singleKeyWords,singleTitle] = await GetHtmlArticleSingle(pathB); //GetHtmlMenu
    //console.log("htmlArticleSingle", htmlArticleSingle,JSON.stringify(htmlArticleSingle));
    // 替换主模板文件
    let htmlPage = themeIndex.r("widgetMenu.html",htmlWidgetMenu)
                            .r("widgetCategory.html",htmlWidgetCategory)
                            .r("widgetTags.html",htmlWidgetTags)
                            .r("widgetRecently.html",htmlWidgetRecently)
                            .r("articleSingle.html",htmlArticleSingle)
                            .r("opt.keyWords",decodeURI(singleKeyWords))
                            .r("title", decodeURI(singleTitle)  +" - " + OPT.siteName)

    //批量替换乱七八糟的
    return htmlPage;
    
}

//分类/标签的html 二合一
async function GetHtmlCategory(pathA,pathB,pathC){
    //console.log("进入函数 GetHtmlCategory");
    //html = themepage.replace(GetHtmlMenu,GetHtmlArticle,GetHtmlRecently,GetHtmlCategory,GetHtmlTags)
    let themeIndex =await getTheme('index'); //主模板
    let htmlWidgetMenu = await GetHtmlWidgetMenu(pathA,pathB); //GetHtmlMenu
    let htmlWidgetCategory = await GetHtmlWidgetCategory(pathA,pathB); //GetHtmlMenu
    let htmlWidgetTags = await GetHtmlWidgetTags(pathA,pathB); //GetHtmlMenu
    let htmlWidgetRecently = await GetHtmlWidgetRecently(pathA,pathB); //(文章类型,))
    //获取文章列表html
    let htmlArticleList = await GetHtmlArticleListCategory(pathA,pathB,pathC); //GetHtmlMenu
    // 替换主模板文件
    let htmlPage = themeIndex.r("widgetMenu.html",htmlWidgetMenu)
                            .r("widgetCategory.html",htmlWidgetCategory)
                            .r("widgetTags.html",htmlWidgetTags)
                            .r("widgetRecently.html",htmlWidgetRecently)
                            .r("articleList.html",htmlArticleList)
                            .r("opt.keyWords",decodeURI(pathB))
                            .r("title", decodeURI(pathB)   +" - " + OPT.siteName) //.r("title", decodeURI(singleTitle)
    return htmlPage;
    
}
//page的html
async function GetHtmlPage(pathA,pathB){
    //console.log("进入函数GetHtmlPage");
    //html = themepage.replace(GetHtmlMenu,GetHtmlArticle,GetHtmlRecently,GetHtmlCategory,GetHtmlTags)
    let themeIndex =await getTheme('index'); //主模板
    let htmlWidgetMenu = await GetHtmlWidgetMenu(pathA,pathB); //GetHtmlMenu
    let htmlWidgetCategory = await GetHtmlWidgetCategory(pathA,pathB); //GetHtmlMenu
    let htmlWidgetTags = await GetHtmlWidgetTags(pathA,pathB); //GetHtmlMenu
    let htmlWidgetRecently = await GetHtmlWidgetRecently(pathA,pathB); //GetHtmlMenu
    
    let htmlArticleList = await GetHtmlArticleList(pathA,pathB); //GetHtmlMenu
    // 替换主模板文件
    let htmlPage = themeIndex.r("widgetMenu.html",htmlWidgetMenu)
                            .r("widgetCategory.html",htmlWidgetCategory)
                            .r("widgetTags.html",htmlWidgetTags)
                            .r("widgetRecently.html",htmlWidgetRecently)
                            .r("articleList.html",htmlArticleList)
                            .r("title", (pathB> 1 ? 'page' + pathB + ' - ' : '') + OPT.siteName)
    
    
    //批量替换乱七八糟的
    return htmlPage;
    
}
//单独文章html
async function GetHtmlArticleSingle(articleId){
    //console.log("进入函数 GetHtmlArticleSingle");
    //获取模板文件
    let themeArticleSingle = await getTheme('articleSingle.html'); 
    
        let themeArticleSingleNewer = await getTheme('articleSingleNewer.html'); 
        let themeArticleSingleOlder = await getTheme('articleSingleOlder.html'); 
        let themeArticleSingleComment = await getTheme('articleSingleComment.html'); 
        let themeArticleSingleArticle =  await getTheme('articleSingleArticle.html');
            let themeArticleSingleArticleTags =      await getTheme('articleSingleArticleTags.html'); 
            let themeArticleSingleArticleCategory =  await getTheme('articleSingleArticleCategory.html'); 
    //从KV获取
    let jsonArticleSingleArray = await getKVArticleSingle(articleId);//page = pathB
    //console.log("jsonArticleSingleArray-------------------:",typeof jsonArticleSingleArray,JSON.stringify(jsonArticleSingleArray));
    let jsonArticleSingle = jsonArticleSingleArray[1]
    let jsonArticleOlder = jsonArticleSingleArray[0]
    let jsonArticleNewer = jsonArticleSingleArray[2]
    if(jsonArticleSingle === undefined )
    return OPT.html404;
    
    //处理分页
    if(jsonArticleOlder === undefined )
        themeArticleSingleOlder = ""
    else{
        themeArticleSingleOlder = themeArticleSingleOlder.r("articleSingleOlder.url","/article/"+jsonArticleOlder.id+"/"+jsonArticleOlder.link+'.html')
                                                 .r("articleSingleOlder.title",jsonArticleOlder.title)    
    }
    if(jsonArticleNewer === undefined)
        themeArticleSingleNewer = ""
    else{

        themeArticleSingleNewer = themeArticleSingleNewer.r("articleSingleNewer.url","/article/"+jsonArticleNewer.id+"/"+jsonArticleNewer.link+'.html')
                                                 .r("articleSingleNewer.title",jsonArticleNewer.title)
    }
    //处理单独文章
    let htmlArticleSingleArticle = '\n';
    let htmlArticleSingleArticleTags = "\n";
    let singleKeyWords = '' ;
    //循环标签
    for(var i1=0,l1=jsonArticleSingle["tags"].length;i1<l1;i1++){ //articleSingleArticleTags
        singleKeyWords = singleKeyWords + jsonArticleSingle["tags"][i1] + ',';
        htmlArticleSingleArticleTags += themeArticleSingleArticleTags.r('articleSingleArticleTags.title',jsonArticleSingle["tags"][i1])
                                                            .r('articleSingleArticleTags.url','/tags/'+jsonArticleSingle["tags"][i1])
    }
    //循环 分类
    let htmlArticleSingleArticleCategory = "\n";
    for(var i12=0,l12=jsonArticleSingle["category"].length;i12<l12;i12++){ //articleSingleArticleCategory
        singleKeyWords = singleKeyWords + jsonArticleSingle["category"][i12] + ',';
        htmlArticleSingleArticleCategory += themeArticleSingleArticleCategory.r('articleSingleArticleCategory.title',jsonArticleSingle["category"][i12])
                                                            .r('articleSingleArticleCategory.url','/category/'+jsonArticleSingle["category"][i12])
    }

    htmlArticleSingleArticle += themeArticleSingleArticle.r('articleSingleArticle.title',jsonArticleSingle["title"])
                                               .r('articleSingleArticle.contentHtml',jsonArticleSingle["contentHtml"].replaceAll("script＞","script>"))
                                               .r('articleSingleArticle.contentText',jsonArticleSingle["contentText"].substr(0,OPT.readMoreLength)+"... ")
                                               .r('articleSingleArticle.contentMD',jsonArticleSingle["contentMD"])
                                               .r('articleSingleArticle.createDate',jsonArticleSingle["createDate"].substr(0,10))
                                               .r('articleSingleArticle.url','/article/'+ jsonArticleSingle["id"] +'/' +jsonArticleSingle["link"]+'.html' )
                                               .r('articleSingleArticle.id',jsonArticleSingle["id"])
                                               .r('articleSingleArticle.link',jsonArticleSingle["link"])
                                               .r('articleSingleArticle.img',jsonArticleSingle["img"]) //正文字段完毕
                                               .r('articleSingleArticleTags.html',htmlArticleSingleArticleTags) //tags
                                               .r('articleSingleArticleCategory.html',htmlArticleSingleArticleCategory) //Category
                                               

    let htmlarticleSingle =  themeArticleSingle.r("articleSingleNewer.html",themeArticleSingleNewer)
                                           .r("articleSingleOlder.html",themeArticleSingleOlder)
                                           .r("articleSingleArticle.html",htmlArticleSingleArticle)
                                           .r("articleSingleComment.html",OPT.commentCode)
                                           
//     console.log("htmlarticleSingle-------------------:",htmlarticleSingle);
// return [undefined,undefined,undefined]
//console.log("htmlarticleSingle-------------------:",typeof htmlarticleSingle,htmlarticleSingle);
    //page存个毛await putKV('SYSTEM_CACHE_HtmlWidgetRecently', htmlWidgetRecently)
    return [htmlarticleSingle,singleKeyWords.trim(','),jsonArticleSingle["title"]];
}

//文章列表区 (分类/标签)
async function GetHtmlArticleListCategory(pathA,pathB,pathC){
    //console.log("进入函数 GetHtmlArticleListCategory");
    //获取模板文件
    let themearticleList = await getTheme('articleList.html'); 
     
        let themearticleListNewer = await getTheme('articleListNewer.html'); 
        let themearticleListOlder = await getTheme('articleListOlder.html'); 
        let themearticleListItem =  await getTheme('articleListItem.html');
            let themearticleListItemImg =       await getTheme('articleListItemImg.html'); 
            let themearticleListItemTags =      await getTheme('articleListItemTags.html'); 
            let themearticleListItemCategory =  await getTheme('articleListItemCategory.html'); 
    //存储的全部,直接用
    let jsonArticleListArray = await getKVArticleCategory(pathB,pathC);//关键字,页码
    let jsonArticleList = jsonArticleListArray[0]
    let isEnd = jsonArticleListArray[1]
    //console.log("GetHtmlArticleListCategory.jsonArticleList-------------------:",typeof jsonArticleList,JSON.stringify(jsonArticleList));
    //console.log("jsonWidgetRecently-------------------:",typeof jsonWidgetRecently,jsonWidgetRecently);
    //处理分页
    if(pathC == 1)
        themearticleListOlder =""
    if(isEnd)
        themearticleListNewer = ""
    themearticleListNewer = themearticleListNewer.r("articleListNewer.url","/"+pathA+"/"+pathB+"/"+ (pathC+1)).r("articleListNewer.title","下一页")
    themearticleListOlder = themearticleListOlder.r("articleListOlder.url","/"+pathA+"/"+pathB+"/"+ (pathC-1)).r("articleListOlder.title","上一页")
    //处理文章列表
    
    let htmlArticleListItem = '\n';
    for(var i=0,l=jsonArticleList.length;i<l;i++){
        let htmlArticleListItemTags = "\n";
        for(var i1=0,l1=jsonArticleList[i]["tags"].length;i1<l1;i1++){ //articleListItemTags
            htmlArticleListItemTags += themearticleListItemTags.r('articleListItemTags.title',jsonArticleList[i]["tags"][i1])
                                                                .r('articleListItemTags.url','/tags/'+jsonArticleList[i]["tags"][i1])
        }
        let htmlArticleListItemCategory = "\n";
        for(var i12=0,l12=jsonArticleList[i]["category"].length;i12<l12;i12++){ //articleListItemCategory
            htmlArticleListItemCategory += themearticleListItemCategory.r('articleListItemCategory.title',jsonArticleList[i]["category"][i12])
                                                                .r('articleListItemCategory.url','/category/'+jsonArticleList[i]["category"][i12])
        }
        htmlArticleListItem += themearticleListItem.r('articleListItem.title',jsonArticleList[i]["title"])
                                                   //.r('articleListItem.contentHtml',jsonArticleList[i]["contentHtml"])
                                                   .r('articleListItem.contentText',jsonArticleList[i]["contentText"].substr(0,OPT.readMoreLength)+"... ")
                                                   //.r('articleListItem.contentMD',jsonArticleList[i]["contentMD"].substr(0,10))
                                                   .r('articleListItem.createDate',jsonArticleList[i]["createDate"].substr(0,10))
                                                   .r('articleListItem.url','/article/'+ jsonArticleList[i]["id"] +'/' +jsonArticleList[i]["link"]+'.html' )
                                                   .r('articleListItem.id',jsonArticleList[i]["id"])
                                                   .r('articleListItem.link',jsonArticleList[i]["link"])
                                                   .r('articleListItem.img',jsonArticleList[i]["img"]) //正文字段完毕
                                                   .r('articleListItemTags.html',htmlArticleListItemTags) //tags
                                                   .r('articleListItemCategory.html',htmlArticleListItemCategory) //Category
                                                   //img模板套进来
                                                   .r('articleListItemImg.html',themearticleListItemImg.r("articleListItemImg.img",jsonArticleList[i]["img"])
                                                                                                       .r("articleListItemImg.title",jsonArticleList[i]["title"])
                                                                                                       .r("articleListItemImg.url",
                                                                                                        '/article/'+ jsonArticleList[i]["id"] +'/' 
                                                                                                        +jsonArticleList[i]["link"]+'.html')
                                                                                                       )
                                                                                                       
                                                    //console.log("jsonArticleList[i][tags]-------------------:",typeof jsonArticleList[i]["tags"],jsonArticleList[i]["tags"]);
    }
    let htmlarticleList =  themearticleList.r("articleListNewer.html",themearticleListNewer)
                                           .r("articleListOlder.html",themearticleListOlder)
                                           .r("articleListItem.html",htmlArticleListItem)
    //console.log("htmlarticleList-------------------:",typeof htmlarticleList,htmlarticleList);
    //page存个毛await putKV('SYSTEM_CACHE_HtmlWidgetRecently', htmlWidgetRecently)
    return htmlarticleList;
}
//文章列表区
async function GetHtmlArticleList(articleType,pathB){
    //console.log("进入函数 GetHtmlArticleList");
    //获取模板文件
    let themearticleList = await getTheme('articleList.html'); 
     
        let themearticleListNewer = await getTheme('articleListNewer.html'); 
        let themearticleListOlder = await getTheme('articleListOlder.html'); 
        let themearticleListItem =  await getTheme('articleListItem.html');
            let themearticleListItemImg =       await getTheme('articleListItemImg.html'); 
            let themearticleListItemTags =      await getTheme('articleListItemTags.html'); 
            let themearticleListItemCategory =  await getTheme('articleListItemCategory.html'); 
    //存储的全部,直接用
    let jsonArticleListArray = await getKVArticleIndex(pathB);//page = pathB
    let jsonArticleList = jsonArticleListArray[0]
    let isEnd = jsonArticleListArray[1]
    //console.log("GetHtmlArticleList.jsonArticleList-------------------:",typeof jsonArticleList,jsonArticleList.length);
    //console.log("jsonWidgetRecently-------------------:",typeof jsonWidgetRecently,jsonWidgetRecently);
    //处理分页
    if(pathB == 1)
        themearticleListOlder =""
    if(isEnd)
        themearticleListNewer = ""
    themearticleListNewer = themearticleListNewer.r("articleListNewer.url","/page/"+ (pathB+1)).r("articleListNewer.title","下一页")
    themearticleListOlder = themearticleListOlder.r("articleListOlder.url","/page/"+ (pathB-1)).r("articleListOlder.title","上一页")
    //处理文章列表
    
    let htmlArticleListItem = '\n';
    for(var i=0,l=jsonArticleList.length;i<l;i++){
        let htmlArticleListItemTags = "\n";
        for(var i1=0,l1=jsonArticleList[i]["tags"].length;i1<l1;i1++){ //articleListItemTags
            htmlArticleListItemTags += themearticleListItemTags.r('articleListItemTags.title',jsonArticleList[i]["tags"][i1])
                                                                .r('articleListItemTags.url','/tags/'+jsonArticleList[i]["tags"][i1])
        }
        let htmlArticleListItemCategory = "\n";
        for(var i12=0,l12=jsonArticleList[i]["category"].length;i12<l12;i12++){ //articleListItemCategory
            htmlArticleListItemCategory += themearticleListItemCategory.r('articleListItemCategory.title',jsonArticleList[i]["category"][i12])
                                                                .r('articleListItemCategory.url','/category/'+jsonArticleList[i]["category"][i12])
        }
        htmlArticleListItem += themearticleListItem.r('articleListItem.title',jsonArticleList[i]["title"])
                                                   //.r('articleListItem.contentHtml',jsonArticleList[i]["contentHtml"])
                                                   .r('articleListItem.contentText',jsonArticleList[i]["contentText"].substr(0,OPT.readMoreLength)+"... ")
                                                   .r('articleListItem.createDate',jsonArticleList[i]["createDate"].substr(0,10))
                                                   //.r('articleListItem.contentMD',jsonArticleList[i]["contentMD"])
                                                   .r('articleListItem.url','/article/'+ jsonArticleList[i]["id"] +'/' +jsonArticleList[i]["link"]+'.html' )
                                                   .r('articleListItem.id',jsonArticleList[i]["id"])
                                                   .r('articleListItem.link',jsonArticleList[i]["link"])
                                                   .r('articleListItem.img',jsonArticleList[i]["img"]) //正文字段完毕
                                                   .r('articleListItemTags.html',htmlArticleListItemTags) //tags
                                                   .r('articleListItemCategory.html',htmlArticleListItemCategory) //Category
                                                   //img模板套进来
                                                   .r('articleListItemImg.html',themearticleListItemImg.r("articleListItemImg.img",jsonArticleList[i]["img"])
                                                                                                       .r("articleListItemImg.title",jsonArticleList[i]["title"])
                                                                                                       .r("articleListItemImg.url",
                                                                                                        '/article/'+ jsonArticleList[i]["id"] +'/' 
                                                                                                        +jsonArticleList[i]["link"]+'.html')
                                                                                                       )
                                                                                                       
                                                    //console.log("jsonArticleList[i][tags]-------------------:",typeof jsonArticleList[i]["tags"],jsonArticleList[i]["tags"]);
    }
    let htmlarticleList =  themearticleList.r("articleListNewer.html",themearticleListNewer)
                                           .r("articleListOlder.html",themearticleListOlder)
                                           .r("articleListItem.html",htmlArticleListItem)
    //console.log("htmlarticleList-------------------:",typeof htmlarticleList,htmlarticleList);
    //page存个毛await putKV('SYSTEM_CACHE_HtmlWidgetRecently', htmlWidgetRecently)
    return htmlarticleList;
}

//菜单html
async function GetHtmlWidgetMenu(pathA,pathB){
    //如果不是publish,直接读取数据库
    if (pathA != "saveToKV")
        return await getKVByKey('SYSTEM_CACHE_HtmlWidgetMenu')
    //console.log("进入函数 GetHtmlWidgetMenu");
    //获取模板文件
    let themeWidgetMenu = await getTheme('widgetMenu.html'); 
    let themeWidgetMenuItem = await getTheme('widgetMenuItem.html'); 
    //存储的全部,直接用
    let jsonWidgetMenu = await getKVByKey("SYSTEM_VALUE_WidgetMenu",true);
    let htmlWidgetMenuItem = '';
    for(var i=0,l=jsonWidgetMenu.length;i<l;i++){
        htmlWidgetMenuItem += themeWidgetMenuItem.r('widgetMenuItem.title',jsonWidgetMenu[i]["title"])
                                                .r('widgetMenuItem.url',jsonWidgetMenu[i]["url"])
                                                + '\n';
    }
    let htmlWidgetMenu =  themeWidgetMenu.r("widgetMenuItem.html",htmlWidgetMenuItem)
    await putKV('SYSTEM_CACHE_HtmlWidgetMenu', htmlWidgetMenu)
    return htmlWidgetMenu;
    
}
//类别html
async function GetHtmlWidgetCategory(pathA,pathB){
    //如果不是publish,直接读取数据库
    if (pathA != "saveToKV")
        return await getKVByKey('SYSTEM_CACHE_HtmlWidgetCategory')
    //console.log("进入函数 GetHtmlWidgetCategory");
    //获取模板文件
    let themeWidgetCategory = await getTheme('widgetCategory.html'); 
    let themeWidgetCategoryItem = await getTheme('widgetCategoryItem.html'); 
    //存储的全部,直接用
    let jsonWidgetCategory = await getKVByKey("SYSTEM_VALUE_WidgetCategory",true);
    let htmlWidgetCategoryItem = '';
    for(var i=0,l=jsonWidgetCategory.length;i<l;i++){
        htmlWidgetCategoryItem += themeWidgetCategoryItem.r('widgetCategoryItem.title',jsonWidgetCategory[i])
                                                .r('widgetCategoryItem.url',"/category/"+jsonWidgetCategory[i])
                                                + '\n';
    }
    let htmlWidgetCategory =  themeWidgetCategory.r("widgetCategoryItem.html",htmlWidgetCategoryItem)
    await putKV('SYSTEM_CACHE_HtmlWidgetCategory', htmlWidgetCategory)
    return htmlWidgetCategory;
    
}
//标签html
async function GetHtmlWidgetTags(pathA,pathB){
    //如果不是publish,直接读取数据库
    if (pathA != "saveToKV")
        return await getKVByKey('SYSTEM_CACHE_HtmlWidgetTags')
    //console.log("进入函数 GetHtmlWidgetTags");
    //获取模板文件
    let themeWidgetTags = await getTheme('widgetTags.html'); 
    let themeWidgetTagsItem = await getTheme('widgetTagsItem.html'); 
    //存储的全部,直接用
    let jsonWidgetTags = await getKVByKey("SYSTEM_VALUE_WidgetTags",true);
    let htmlWidgetTagsItem = '';
    for(var i=0,l=jsonWidgetTags.length;i<l;i++){
        htmlWidgetTagsItem += themeWidgetTagsItem.r('widgetTagsItem.title',jsonWidgetTags[i])
                                                .r('widgetTagsItem.url',"/tags/"+jsonWidgetTags[i])
                                                + '\n';
    }
    let htmlWidgetTags =  themeWidgetTags.r("widgetTagsItem.html",htmlWidgetTagsItem)
    await putKV('SYSTEM_CACHE_HtmlWidgetTags', htmlWidgetTags)
    return htmlWidgetTags;
    
}
//最近文章 html
async function GetHtmlWidgetRecently(pathA,pathB){
    //如果不是publish,直接读取数据库
    if (pathA != "saveToKV")
        return await getKVByKey('SYSTEM_CACHE_HtmlWidgetRecently')
    //console.log("进入函数 GetHtmlWidgetRecently");
    //获取模板文件
    let themeWidgetRecently = await getTheme('widgetRecently.html'); 
    let themeWidgetRecentlyItem = await getTheme('widgetRecentlyItem.html'); 
    //存储的全部,直接用
    let jsonWidgetRecentlyArray = await getKVArticleIndex(1,OPT.recentlySize);
    let jsonWidgetRecently = jsonWidgetRecentlyArray[0]
    //console.log("jsonWidgetRecently-------------------:",typeof jsonWidgetRecently,jsonWidgetRecently);
    let htmlWidgetRecentlyItem = '\n';
    for(var i=0,l=jsonWidgetRecently.length;i<l;i++){
        htmlWidgetRecentlyItem += themeWidgetRecentlyItem.r('widgetRecentlyItem.title',jsonWidgetRecently[i]["title"])
                                                .r('widgetRecentlyItem.url','/article/'+ jsonWidgetRecently[i]["id"] +'/' +jsonWidgetRecently[i]["link"]+'.html' )
                                                .r('widgetRecentlyItem.img',jsonWidgetRecently[i]["img"])
                                                + '\n';
    }
    let htmlWidgetRecently =  themeWidgetRecently.r("widgetRecentlyItem.html",htmlWidgetRecentlyItem)
    await putKV('SYSTEM_CACHE_HtmlWidgetRecently', htmlWidgetRecently)
    return htmlWidgetRecently;
    
}


///////////////////////////////////// KV操作 //////////////////////////////////////////////////////////////////
//获取文章索引Category
async function getKVArticleCategory(keyWords,page,pageSize=OPT.pageSize) {
    keyWords = decodeURI(keyWords)
    console.log("进入函数: getKVArticleCategory",keyWords,page,pageSize);
    page = (page <= 1 ? 1 : page);
    let ArticleAll = await getKVByKey("SYSTEM_INDEX_LIST",true);
    //console.log("ArticleAll-------------------:", ArticleAll);
    //从ALL里面,搜出包含关键字的
    let ArticleIndexJson = [];
    for(var i = 0 , l=ArticleAll.length;i<l;i++){
        //console.log("push-------------------:", i,ArticleIndexJson[i]);
        if ((ArticleAll[i]["tags"].indexOf(keyWords) > -1) || (ArticleAll[i]["category"].indexOf(keyWords) > -1 ) ){
            ArticleIndexJson.push(ArticleAll[i]);
        }
        else{
            //console.log("indexOf(keyWords)-------------------:", ArticleAll[i]["tags"].indexOf(keyWords),ArticleAll[i]["category"].indexOf(keyWords));
            
        }
    }
    //组合后,排个序
    ArticleIndexJson = sortByKey(ArticleIndexJson,"id")
    //console.log("ArticleIndexJson-------------------:", ArticleIndexJson);
    //console.log("page-------------------:",page,pageSize);
    let isEnd = ArticleIndexJson.length > pageSize * page ? false : true ;//返回是否最后一页
    //console.log("type of isEnd:", typeof isEnd,isEnd );
    let ArticleJson =[]
    for(var i=(page-1) * pageSize , l=Math.min(page * pageSize ,ArticleIndexJson.length);i<l;i++){
        //console.log("push-------------------:", i,ArticleIndexJson[i]);
        ArticleJson.push(ArticleIndexJson[i])
    }
    ArticleJson = sortByKey(ArticleJson,"id")
    //console.log("ArticleJson-------------------:",typeof  ArticleJson,ArticleJson);
    return [ArticleJson,isEnd]

}
//获取单个文章索引 getKVArticleSingle
async function getKVArticleSingle(articleId) {
    articleId =  ( "00000" + parseInt(articleId) ).substr(-6);
    let ArticleIndexJson = await getKVByKey("SYSTEM_INDEX_LIST",true);
    //在索引中的位置,只要 -1 和+1,当前的从数据库读取
    let articleWZ = -1;
    for(var i=0, l=ArticleIndexJson.length;i<l;i++){
        if (ArticleIndexJson[i]["id"]== articleId){
            articleWZ = i;
            break;
        }
    } 
    //获取当前文章
    let ArticleJust = await getKVByKey(articleId,true);
    if(ArticleJust==undefined || ArticleJust.length === 0 )
    return [undefined,undefined,undefined]
    //返回 [newer,just,older]
    return [ArticleIndexJson[(articleWZ-1)], ArticleJust,ArticleIndexJson[(articleWZ+1)]]

}

//获取文章索引
async function getKVArticleIndex(page,pageSize=OPT.pageSize) {
    page = (page <= 1 ? 1 : page);
    let ArticleIndexJson = await getKVByKey("SYSTEM_INDEX_LIST",true);

    //console.log("page-------------------:",page,pageSize);
    let isEnd = ArticleIndexJson.length > pageSize * page ? false : true ;//返回是否最后一页
    //console.log("type of isEnd:", typeof isEnd,isEnd );
    let ArticleJson =[]
    for(var i=(page-1) * pageSize , l=Math.min(page * pageSize ,ArticleIndexJson.length);i<l;i++){
        //console.log("push-------------------:", i,ArticleIndexJson[i]);
        ArticleJson.push(ArticleIndexJson[i])
    }
    ArticleJson = sortByKey(ArticleJson,"id")
    //console.log("ArticleJson-------------------:",typeof  ArticleJson,ArticleJson);
    return [ArticleJson,isEnd]

}
//返回并设置文章ID
async function getKVNewId() {
    let V = await getKVByKey("SYSTEM_INDEX_NUM");
    if (V ==='' ||V === null||V === '[]' || V === undefined) {
        await putKV("SYSTEM_INDEX_NUM",1);
        return "000001" ;
        
     }
    else{
        await putKV("SYSTEM_INDEX_NUM",parseInt(V)+1);
        return ( "00000" + (parseInt(V)+1) ).substr(-6);
    }
}
//要存入数据库的html缓存 SYSTEM_CACHE_MENU,SYSTEM_CACHE_CATEGORY,SYSTEM_CACHE_RECENTLY,SYSTEM_CACHE_TAGS,
//要存入数据库的设置值  SYSTEM_VALUE_WidgetMenu,SYSTEM_VALUE_CATEGORY
async function getKVByKey(key,isJSON = false) {
    console.log("------------KV读取---------------------:", key,isJSON );
    let V = await CFBLOG.get(key);
    if(isJSON){
        try {
            if (V === null || V === undefined )
                return [];
            else
                return JSON.parse(V);
        } 
        catch (error) {
            return [];
        }
    }
    else{
        if (V === null || V === undefined )
            return '[]' ;
        else
            return V ;
    }
}

async function getKVKeys(keys=[],cursor='',limit=1) {
    const value = await CFBLOG.list({limit: limit, cursor: cursor})
    keys=keys.concat(value.keys)
    if (value.list_complete){
        //console.log("value ",typeof value,value);
        let kvs = {OPT:OPT}
        for(let i = 0; i < keys.length; ++i) {
            const KEYvalue = await CFBLOG.get(keys[i].name)
            if (KEYvalue != null) {
                kvs[keys[i].name] = isJSON(KEYvalue) ? JSON.parse(KEYvalue) : KEYvalue
            }
        }
        return kvs
    }
    else{
        return await getKVKeys(keys,value.cursor,limit);
    }
    return {};
}

async function putKV(key,v) {
    if (v== null || v== undefined)
    return false;
    if(typeof v === "object")
        v = JSON.stringify(v)
    //console.log("===============KV写入================:", key);
    return await CFBLOG.put(key,v);
}

//发表新文章后,1分钟后,刷新一下SYSTEM_INDEX_LIST and SYSTEM_INDEX_NUM
async function KVRefreshArticleIndex() {
    let articleKeys = await CFBLOG.list({"prefix": "0"})
    articleKeys=articleKeys.keys
    // //console.log("type of articleKeys:", typeof articleKeys );
    // //console.log("value of articleKeys:",  articleKeys );
    let newIndex =[]
    for(var i=0,l=articleKeys.length;i<l;i++){
         newIndex.push(parseInt(articleKeys[i]["name"]));
    }
    newIndex.reverse()
    let newNum = parseInt(newIndex[0]) || 0 ;
    //console.log("type of newNum:", typeof newNum,newNum );
    // //console.log("type of newIndex:", typeof newIndex,newIndex );
    // //console.log("value of newIndex.toString:",  newIndex.toString() );
    await putKV("SYSTEM_INDEX_NUM",newNum);
    await putKV("SYSTEM_INDEX_LIST",newIndex.toString());
    // //console.log("rst:", rst );

    // //console.log("type of V:", typeof V,V );
    return 1;
}

//////////////其他小函数//////////////////////////////////////////////////////////////////////////////////////////
function getCurrentTime() {
    var date = new Date();//当前时间
    var month = zeroFill(date.getMonth() + 1);//月
    var day = zeroFill(date.getDate());//日
    var hour = zeroFill(date.getHours());//时
    var minute = zeroFill(date.getMinutes());//分
    var second = zeroFill(date.getSeconds());//秒
    //当前时间
    var curTime = date.getFullYear() + "-" + month + "-" + day
            + "T" + hour + ":" + minute + ":" + second;
    
    return curTime;
}
function zeroFill(i){
    if (i >= 0 && i <= 9) {
        return "0" + i;
    } else {
        return i;
    }
}

async function getTheme(thmeType){
    //console.log("---抓取模板---:", thmeType );
    thmeType = thmeType.replace(".html","")
    let rst =  await fetch(OPT.themeURL+thmeType+'.html',{ cf: { cacheTtl: 600 } });
    return rst.text();
    
}
//去除两头的字符
String.prototype.trim = function (char) {
    if (char) {
        return this.replace(new RegExp('^\\'+char+'+|\\'+char+'+$', 'g'), '');
    }
    return this.replace(/^\s+|\s+$/g, '');
};
//替换html模板return this.replace(new RegExp(FindText, "g"), RepText);
String.prototype.r = function (oldStr,newStr) {
  //return this.replace("<!--{"+oldStr+"}-->",newStr);
  if(newStr !=undefined)
  newStr = newStr.replace(new RegExp("[$]", "g"), "$$$$");
  return this.replace(new RegExp("<!--{"+oldStr+"}-->", "g"), newStr);
};
String.prototype.replaceAll = function (oldStr,newStr) {
  //return this.replace("<!--{"+oldStr+"}-->",newStr);
  return this.replace(new RegExp(oldStr, "g"), newStr);
};
//json对象排序,默认倒叙
function sortByKey(array, key,isDesc=true) {
    return array.sort(function(a, b) {
        var x = a[key]; var y = b[key];
        return isDesc ? ((x > y) ? -1 : ( (x < y) ? 1 : 0)) : ((x < y) ? -1 : ( (x > y) ? 1 : 0));
      
    });
}

////////////密码认证用的函数,来自 https://github.com/maple3142/GDIndex
  function unauthorized() {
    return new Response('Unauthorized', {
      headers: {
        'WWW-Authenticate': 'Basic realm="cfblog"',
        'Access-Control-Allow-Origin': '*'
      },
      status: 401
    });
  }

  function parseBasicAuth(auth) {
    try {
      return atob(auth.split(' ').pop()).split(':');
    } catch (e) {
      return [];
    }
  }

  function doBasicAuth(request) {
    const auth = request.headers.get('Authorization');

    if (!auth || !/^Basic [A-Za-z0-9._~+/-]+=*$/i.test(auth)) {
      return false;
    }

    const [user, pass] = parseBasicAuth(auth);
    console.log("-----parseBasicAuth----- ",user,pass);
    return user === OPT.user && pass === OPT.password;
  }

function isJSON(str) {
        if (typeof str == 'string') {
            try {
                var obj=JSON.parse(str);
                if(typeof obj == 'object' && obj ){
                    return true;
                }else{
                    return false;
                }
    
            } catch(e) {
               // //console.log('error：'+str+'!!!'+e);
                return false;
            }
        }
        if (typeof str =='object' && str) {
            return true;
        }
        else{
            return false;
        }
        //console.log('It is not a string!')
    }
    //由于分类参数里包含多个相同参数,只能通过正则提取
function getCategory(url) {
    var reg = /category=[^&]*/gi;
    var result = url.match(reg);
    var n = []
    if(result == null) 
        return n ;
    for(let i = 0; i < result.length; ++i) 
    {
        n.push(result[i].replace("category=",""))
    }
    return n ;
}
//获取POST数据
async function readRequestBody(request) {
  const { headers } = request
  const contentType = headers.get("content-type") || ""

  if (contentType.includes("application/json")) {
    let string = JSON.stringify(await request.json());
    let postJson = JSON.parse(string);
    
    let newJson ={}
    newJson.category=[]
    for (var i = 0; i < postJson.length; i++) {
        if ('tags' == postJson[i].name) {
          newJson[postJson[i].name] = postJson[i].value.split(',');
        }
        else if( postJson[i].name.includes("category")) {
          newJson.category.push( postJson[i].value)   
        }
        else{
            newJson[postJson[i].name] = postJson[i].value;
        }
        
    }
    //console.log(JSON.stringify(newJson));
    return newJson;
  }
  else if (contentType.includes("application/text")) {
    return await request.text()
  }
  else if (contentType.includes("text/html")) {
    return await request.text()
  }
  else if (contentType.includes("form")) {
    const formData = await request.formData()
    const body = {}
    for (const entry of formData.entries()) {
      body[entry[0]] = entry[1]
    }
    return JSON.stringify(body)
  }
  else {
    const myBlob = await request.blob()
    const objectURL = URL.createObjectURL(myBlob)
    return objectURL
  }
}
//清理缓存
async function purgeCache(zone=OPT.cacheZoneId, key= OPT.cacheToken) {
    if(zone == undefined || key == undefined || zone.length<5 || key.length<5)
        return false
    let response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`,
        {
            method: "POST",
            headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json"
            },
            body: '{"purge_everything":true}'
        }
    );
    let data = await response.json();
    return data.success;
}
//开启缓存 newHdrs.set('Cache-Control', "public, max-age=" + 31536000);
//存入缓存 event.waitUntil(cache.put(url, response.clone()));
//判断缓存 let response = await cache.match(url);