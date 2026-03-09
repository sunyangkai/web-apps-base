# 埋点 SDK 核心功能实现原理详解

## 一、获取用户浏览路径

### 什么是浏览路径？
浏览路径是用户在网站中访问的页面顺序，例如：
```
首页 → 商品列表 → 商品详情 → 加入购物车 → 结算页
```

### 实现原理

#### 1. 单页面应用（SPA）路径追踪

**方法一：监听路由变化（以 React Router 为例）**

```javascript
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Tracker from 'base/Tracker';

function App() {
  const location = useLocation();
  const tracker = new Tracker({ appId: 'my-app' });

  useEffect(() => {
    // 路由变化时自动追踪页面浏览
    tracker.trackPageView();
  }, [location]); // 依赖 location，每次路由变化都会触发

  return <div>...</div>;
}
```

**原理解析：**
- SPA 不会刷新页面，URL 变化通过 History API（pushState/replaceState）
- React Router 的 useLocation 监听 URL 变化
- 每次 location 变化，触发 useEffect，调用 trackPageView()
- trackPageView() 会记录：
  ```javascript
  {
    eventName: 'page_view',
    eventData: {
      title: 'iPhone 14 详情',  // document.title
      path: '/products/123',     // location.pathname
    },
    url: 'https://example.com/products/123',
    referrer: 'https://example.com/products', // 上一页
    timestamp: 1678901234567,
    sessionId: '1234567890_abc'  // 会话ID，用于串联路径
  }
  ```

**方法二：拦截 History API**

```javascript
// 全局拦截 pushState 和 replaceState
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function(...args) {
  originalPushState.apply(this, args);
  tracker.trackPageView(); // 路由变化时追踪
};

history.replaceState = function(...args) {
  originalReplaceState.apply(this, args);
  tracker.trackPageView();
};

// 拦截浏览器前进后退
window.addEventListener('popstate', () => {
  tracker.trackPageView();
});
```

#### 2. 传统多页面应用（MPA）路径追踪

**实现方式：**
```javascript
// 每个页面加载时自动追踪
const tracker = new Tracker({ appId: 'my-app' });
// tracker.init() 内部会自动调用 trackPageView()
```

**原理：**
- 每次页面刷新都是新的 HTML 加载
- SDK 初始化时自动调用 trackPageView()
- document.referrer 记录上一页 URL（浏览器自动提供）

#### 3. 路径串联分析

**后端如何串联路径？**

通过 **sessionId** 将同一用户的页面浏览串联起来：

```javascript
// 用户访问记录
[
  { sessionId: 'sess_123', url: '/home', timestamp: 1000 },
  { sessionId: 'sess_123', url: '/products', timestamp: 2000 },
  { sessionId: 'sess_123', url: '/products/123', timestamp: 3000 },
  { sessionId: 'sess_123', url: '/cart', timestamp: 4000 },
]

// 后端分析：按 sessionId 分组 + 按 timestamp 排序
// 得到用户路径：/home → /products → /products/123 → /cart
```

**sessionId 生成原理：**
```javascript
generateSessionId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  // 示例：1678901234567_k7j2n5x8w
  // 时间戳确保唯一性，随机字符串防止冲突
}
```

---

## 二、获取用户操作路径

### 什么是操作路径？
操作路径是用户在页面上的具体行为顺序，例如：
```
点击"搜索框" → 输入"iPhone" → 点击"搜索按钮" → 点击"第3个商品" → 点击"加入购物车"
```

### 实现原理

#### 1. 自动追踪点击事件（事件委托）

**核心代码：**
```javascript
export function autoTrackClicks(tracker, selector = 'button, a, [data-track]') {
  document.addEventListener('click', (e) => {
    const target = e.target.closest(selector);
    if (target) {
      const trackData = target.dataset.track ? JSON.parse(target.dataset.track) : {};
      tracker.trackClick(target, trackData);
    }
  });
}
```

**原理详解：**

**步骤1：事件委托**
- 在 `document` 上监听 `click` 事件（只需1个监听器）
- 利用**事件冒泡**机制：子元素点击会冒泡到 document
- 优势：支持动态添加的元素，无需为每个按钮单独绑定

**步骤2：查找目标元素**
```javascript
const target = e.target.closest(selector);
// e.target：实际被点击的元素（可能是按钮内的文字、图标）
// closest(selector)：向上查找最近的匹配元素
// 例如：点击 <button><span>提交</span></button> 中的 span
//      e.target = span, target = button
```

**步骤3：收集点击信息**
```javascript
trackClick(element, extraData = {}) {
  const data = {
    tagName: element.tagName,           // 'BUTTON'
    id: element.id,                     // 'submit-btn'
    className: element.className,       // 'btn btn-primary'
    text: element.innerText?.substring(0, 100), // '立即购买'
    ...extraData,
  };
  this.track('click', data);
}
```

**实际追踪数据：**
```javascript
{
  eventName: 'click',
  eventData: {
    tagName: 'BUTTON',
    id: 'buy-now',
    className: 'btn-primary',
    text: '立即购买',
    productId: '123' // 来自 data-track
  },
  url: '/products/123',
  timestamp: 1678901234567,
  sessionId: 'sess_123'
}
```

#### 2. 自定义埋点（精确控制）

**方式1：使用 data-track 属性**
```html
<button
  id="buy-now"
  data-track='{"action":"purchase","productId":"123","price":5999}'
>
  立即购买
</button>
```

点击时自动追踪：
```javascript
{
  eventName: 'click',
  eventData: {
    tagName: 'BUTTON',
    id: 'buy-now',
    text: '立即购买',
    action: 'purchase',      // 来自 data-track
    productId: '123',        // 来自 data-track
    price: 5999              // 来自 data-track
  }
}
```

**方式2：手动调用 track()**
```javascript
function handleAddToCart(product) {
  // 业务逻辑
  addToCart(product);

  // 手动埋点
  tracker.track('add_to_cart', {
    productId: product.id,
    productName: product.name,
    price: product.price,
    quantity: 1,
    source: 'detail_page'
  });
}
```

#### 3. 操作路径串联

**后端分析操作序列：**
```javascript
// 同一 sessionId 的操作记录
[
  { sessionId: 'sess_123', eventName: 'page_view', url: '/products/123', timestamp: 1000 },
  { sessionId: 'sess_123', eventName: 'click', id: 'image-preview', timestamp: 2000 },
  { sessionId: 'sess_123', eventName: 'click', id: 'color-select', text: '红色', timestamp: 3000 },
  { sessionId: 'sess_123', eventName: 'add_to_cart', productId: '123', timestamp: 4000 },
  { sessionId: 'sess_123', eventName: 'click', id: 'checkout', timestamp: 5000 },
]

// 分析结果：
// 用户路径：访问商品详情 → 查看大图 → 选择红色 → 加购 → 去结算
```

---

## 三、获取页面报错

### 实现原理

#### 1. 捕获同步代码错误和资源加载错误

**核心代码：**
```javascript
window.addEventListener('error', (e) => {
  tracker.trackError(e.error || new Error(e.message), {
    filename: e.filename,   // 错误文件
    lineno: e.lineno,       // 错误行号
    colno: e.colno,         // 错误列号
  });
}, true); // true 表示捕获阶段监听，可以捕获资源加载错误
```

**可捕获的错误类型：**

**类型1：JavaScript 运行时错误**
```javascript
// 代码错误
undefined.toString(); // TypeError: Cannot read property 'toString' of undefined

// 追踪数据：
{
  eventName: 'error',
  eventData: {
    message: "Cannot read property 'toString' of undefined",
    stack: "TypeError: Cannot read property...\n  at App.js:25:10",
    filename: 'https://example.com/static/js/App.js',
    lineno: 25,
    colno: 10
  },
  url: '/products/123',
  timestamp: 1678901234567
}
```

**类型2：资源加载错误**
```html
<!-- 图片加载失败 -->
<img src="https://cdn.example.com/broken-image.jpg">

// 追踪数据：
{
  eventName: 'error',
  eventData: {
    message: 'Script error.',
    filename: 'https://cdn.example.com/broken-image.jpg',
    type: 'resource_error'
  }
}
```

#### 2. 捕获异步错误（Promise rejection）

**核心代码：**
```javascript
window.addEventListener('unhandledrejection', (e) => {
  tracker.trackError(new Error(e.reason), {
    type: 'unhandledRejection',
  });
});
```

**可捕获的场景：**
```javascript
// 未处理的 Promise 错误
fetch('/api/products')
  .then(res => res.json())
  // 忘记写 .catch()，如果请求失败会触发 unhandledrejection

// async/await 未 try-catch
async function loadData() {
  const data = await fetch('/api/products').then(r => r.json());
  // 如果请求失败，没有 try-catch 会触发 unhandledrejection
}

// 追踪数据：
{
  eventName: 'error',
  eventData: {
    message: 'Failed to fetch',
    stack: '...',
    type: 'unhandledRejection'
  }
}
```

#### 3. 手动捕获业务错误

```javascript
try {
  // 业务逻辑
  const result = processPayment(orderData);
} catch (error) {
  // 手动上报错误
  tracker.trackError(error, {
    module: 'payment',
    operation: 'submit_order',
    orderId: orderData.id
  });

  // 显示错误提示
  showErrorMessage('支付失败，请重试');
}
```

#### 4. 错误信息详解

**Error 对象包含的信息：**
```javascript
{
  message: '错误描述',              // 错误信息
  stack: 'TypeError: ...\n at ...',  // 错误堆栈（定位代码位置）
  name: 'TypeError',                 // 错误类型
}
```

**堆栈信息示例：**
```
TypeError: Cannot read property 'name' of undefined
    at UserProfile (App.js:45:18)
    at renderWithHooks (react-dom.js:14985:18)
    at mountIndeterminateComponent (react-dom.js:17811:13)
```

通过堆栈可以定位：
- 错误发生在 `App.js` 第 45 行第 18 列
- 在 `UserProfile` 组件中
- 由 React 渲染流程触发

---

## 四、数据如何关联分析

### 1. 通过 sessionId 串联用户行为

```javascript
// 同一用户的完整行为链路
[
  // 浏览路径
  { sessionId: 'sess_123', eventName: 'page_view', path: '/home', timestamp: 1000 },
  { sessionId: 'sess_123', eventName: 'page_view', path: '/products', timestamp: 2000 },

  // 操作路径
  { sessionId: 'sess_123', eventName: 'click', id: 'search-btn', timestamp: 3000 },
  { sessionId: 'sess_123', eventName: 'search', keyword: 'iPhone', timestamp: 3100 },
  { sessionId: 'sess_123', eventName: 'click', id: 'product-123', timestamp: 4000 },

  // 页面跳转
  { sessionId: 'sess_123', eventName: 'page_view', path: '/products/123', timestamp: 4500 },

  // 发生错误
  { sessionId: 'sess_123', eventName: 'error', message: 'Image load failed', timestamp: 5000 },

  // 继续操作
  { sessionId: 'sess_123', eventName: 'add_to_cart', productId: '123', timestamp: 6000 },
]
```

**分析结果：**
- 用户从首页进入商品列表
- 搜索 "iPhone"
- 点击商品123
- 进入商品详情页
- 页面图片加载失败（需优化）
- 但用户仍然完成了加购（错误未影响转化）

### 2. 通过 userId 跨会话分析

```javascript
// 用户在不同时间的访问
[
  // 第一次访问（周一）
  { userId: 'user_456', sessionId: 'sess_001', path: '/products/123', timestamp: day1 },
  { userId: 'user_456', sessionId: 'sess_001', eventName: 'add_to_cart', timestamp: day1 },

  // 第二次访问（周三）
  { userId: 'user_456', sessionId: 'sess_002', path: '/cart', timestamp: day3 },
  { userId: 'user_456', sessionId: 'sess_002', eventName: 'checkout', timestamp: day3 },
]
```

**分析结果：**
- 用户周一浏览商品并加购
- 周三才回来完成购买
- 转化周期：2天

### 3. 漏斗分析

```javascript
// 统计每个步骤的用户数
SELECT
  COUNT(DISTINCT CASE WHEN eventName = 'page_view' AND path = '/products' THEN sessionId END) as 浏览商品,
  COUNT(DISTINCT CASE WHEN eventName = 'add_to_cart' THEN sessionId END) as 加入购物车,
  COUNT(DISTINCT CASE WHEN eventName = 'checkout' THEN sessionId END) as 提交订单,
  COUNT(DISTINCT CASE WHEN eventName = 'payment_success' THEN sessionId END) as 支付成功
FROM events
WHERE timestamp BETWEEN '2024-01-01' AND '2024-01-31';

// 结果：
// 浏览商品: 10000 人
// 加购: 3000 人 (30% 转化)
// 提交订单: 1500 人 (50% 转化)
// 支付成功: 1200 人 (80% 转化)
```

---

## 五、实际应用案例

### 案例1：定位页面错误

**问题：** 用户反馈商品详情页打不开

**分析步骤：**
1. 查询最近的错误埋点
```sql
SELECT * FROM events
WHERE eventName = 'error'
  AND url LIKE '%/products/%'
  AND timestamp > NOW() - INTERVAL 1 DAY
ORDER BY timestamp DESC;
```

2. 发现错误：
```javascript
{
  message: "Cannot read property 'price' of undefined",
  stack: "at ProductDetail.js:56:10",
  url: '/products/999'
}
```

3. 定位问题：
- 商品 ID 999 的数据缺少 price 字段
- 代码未做空值判断
- 修复：`product?.price || 0`

### 案例2：分析用户流失

**问题：** 购物车页面流失率高

**分析步骤：**
1. 查询进入购物车但未结算的用户
```sql
SELECT sessionId, eventName, timestamp
FROM events
WHERE sessionId IN (
  SELECT sessionId FROM events WHERE path = '/cart'
  AND sessionId NOT IN (
    SELECT sessionId FROM events WHERE eventName = 'checkout'
  )
)
ORDER BY sessionId, timestamp;
```

2. 发现规律：
- 很多用户在购物车页面触发了 `error` 事件
- 错误信息：`Failed to load shipping info`

3. 解决方案：
- 优化运费接口性能
- 添加加载失败的重试机制
- 结果：流失率从 40% 降到 25%

---

## 总结

| 功能 | 核心技术 | 关键数据 |
|------|---------|---------|
| **浏览路径** | History API 拦截 / useLocation | sessionId + url + timestamp |
| **操作路径** | 事件委托 / data-track 属性 | sessionId + eventName + eventData |
| **页面报错** | window.error / unhandledrejection | error.message + stack + filename |

所有数据通过 **sessionId** 和 **timestamp** 串联，形成完整的用户行为链路。
