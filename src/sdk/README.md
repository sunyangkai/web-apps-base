# 埋点 SDK 使用文档

## 功能特性

- 轻量化设计，无外部依赖
- 自动批量上报，减少网络请求
- 支持页面浏览、点击、错误、性能等事件追踪
- 页面卸载时使用 `sendBeacon` 确保数据不丢失
- 支持自定义事件追踪
- 自动收集用户、会话、页面等基础信息

## 基础用法

### 1. 在其他微应用中引入

```javascript
import Tracker, { autoTrackClicks, autoTrackErrors } from 'base/Tracker';

// 初始化埋点 SDK
const tracker = new Tracker({
  endpoint: '/api/track',           // 上报地址
  appId: 'user-app',                // 应用ID
  userId: '',                       // 用户ID（可选）
  batchSize: 10,                    // 批量上报大小
  autoFlushInterval: 5000,          // 自动上报间隔（毫秒）
  enabled: true,                    // 是否启用
});

// 自动追踪点击事件
autoTrackClicks(tracker);

// 自动追踪错误
autoTrackErrors(tracker);
```

### 2. 追踪自定义事件

```javascript
// 追踪按钮点击
tracker.track('button_click', {
  buttonName: 'submit',
  formId: 'login-form',
});

// 追踪商品查看
tracker.track('product_view', {
  productId: '12345',
  productName: 'iPhone 14',
  price: 5999,
});

// 追踪搜索
tracker.track('search', {
  keyword: 'react',
  resultCount: 100,
});
```

### 3. 追踪页面浏览

```javascript
// 自动追踪当前页面（初始化时自动调用）
tracker.trackPageView();

// 在 SPA 路由变化时手动调用
router.afterEach(() => {
  tracker.trackPageView();
});
```

### 4. 追踪点击事件

```javascript
// 方式1: 手动追踪
document.querySelector('#myButton').addEventListener('click', (e) => {
  tracker.trackClick(e.target, {
    campaign: 'summer-sale',
  });
});

// 方式2: 使用 data-track 属性自动追踪
<button data-track='{"action":"purchase","productId":"123"}'>
  购买
</button>
```

### 5. 追踪错误

```javascript
// 手动追踪错误
try {
  // 业务逻辑
} catch (error) {
  tracker.trackError(error, {
    module: 'payment',
    operation: 'submit',
  });
}

// 自动追踪全局错误（使用 autoTrackErrors）
autoTrackErrors(tracker);
```

### 6. 追踪性能指标

```javascript
// 页面加载完成后追踪性能
window.addEventListener('load', () => {
  tracker.trackPerformance();
});
```

### 7. 设置用户ID

```javascript
// 用户登录后设置用户ID
tracker.setUserId('user_12345');
```

### 8. 手动上报

```javascript
// 立即上报队列中的数据
tracker.flush();
```

### 9. 销毁实例

```javascript
// 组件卸载时销毁
tracker.destroy();
```

## 完整示例（user 应用）

```javascript
// packages/user/src/App.jsx
import React, { useEffect } from 'react';
import Tracker, { autoTrackClicks, autoTrackErrors } from 'base/Tracker';

let tracker;

function App() {
  useEffect(() => {
    // 初始化埋点
    tracker = new Tracker({
      endpoint: '/api/track',
      appId: 'user-app',
      userId: localStorage.getItem('userId'),
      batchSize: 10,
      autoFlushInterval: 5000,
    });

    // 启用自动追踪
    autoTrackClicks(tracker);
    autoTrackErrors(tracker);

    // 追踪性能
    window.addEventListener('load', () => {
      tracker.trackPerformance();
    });

    return () => {
      tracker.destroy();
    };
  }, []);

  const handleLogin = (userId) => {
    tracker.setUserId(userId);
    tracker.track('user_login', {
      loginMethod: 'email',
    });
  };

  const handleProductClick = (product) => {
    tracker.track('product_click', {
      productId: product.id,
      productName: product.name,
      price: product.price,
    });
  };

  return (
    <div>
      <button onClick={() => handleLogin('user123')}>登录</button>
      <button
        data-track='{"action":"view_cart"}'
        onClick={() => console.log('查看购物车')}
      >
        查看购物车
      </button>
    </div>
  );
}

export default App;
```

## 数据格式

每条埋点数据包含以下字段：

```javascript
{
  // 通用字段
  appId: 'user-app',
  userId: 'user_12345',
  sessionId: '1234567890_abc123',
  url: 'https://example.com/products',
  referrer: 'https://example.com/home',
  timestamp: 1678901234567,
  userAgent: 'Mozilla/5.0...',
  screenResolution: '1920x1080',
  viewportSize: '1280x720',

  // 事件字段
  eventName: 'product_click',
  eventData: {
    productId: '12345',
    productName: 'iPhone 14',
    price: 5999
  }
}
```

## 配置选项

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| endpoint | String | '/api/track' | 数据上报地址 |
| appId | String | '' | 应用标识 |
| userId | String | '' | 用户标识 |
| batchSize | Number | 10 | 批量上报大小 |
| autoFlushInterval | Number | 5000 | 自动上报间隔（毫秒）|
| enabled | Boolean | true | 是否启用埋点 |

## 注意事项

1. **后端接口**：需要实现 `/api/track` 接口接收埋点数据
2. **隐私合规**：收集用户数据需遵守相关隐私法规（GDPR、个人信息保护法等）
3. **性能优化**：建议根据实际情况调整 `batchSize` 和 `autoFlushInterval`
4. **环境控制**：可在生产环境启用，开发环境禁用（`enabled: process.env.NODE_ENV === 'production'`）
