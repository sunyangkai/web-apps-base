/**
 * 轻量化埋点 SDK
 * 支持页面浏览、点击事件、自定义事件追踪
 */

class Tracker {
  constructor(options = {}) {
    this.endpoint = options.endpoint || '/api/track';
    this.appId = options.appId || '';
    this.userId = options.userId || '';
    this.sessionId = this.generateSessionId();
    this.queue = [];
    this.batchSize = options.batchSize || 10;
    this.autoFlushInterval = options.autoFlushInterval || 5000;
    this.enabled = options.enabled !== false;

    if (this.enabled) {
      this.init();
    }
  }

  init() {
    // 页面加载时追踪
    this.trackPageView();

    // 页面卸载时上报剩余数据
    window.addEventListener('beforeunload', () => {
      this.flush(true);
    });

    // 定时批量上报
    if (this.autoFlushInterval > 0) {
      this.timer = setInterval(() => {
        this.flush();
      }, this.autoFlushInterval);
    }
  }

  generateSessionId() {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  getCommonData() {
    return {
      appId: this.appId,
      userId: this.userId,
      sessionId: this.sessionId,
      url: window.location.href,
      referrer: document.referrer,
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    };
  }

  track(eventName, eventData = {}) {
    if (!this.enabled) return;

    const data = {
      ...this.getCommonData(),
      eventName,
      eventData,
    };

    this.queue.push(data);

    // 达到批量大小时自动上报
    if (this.queue.length >= this.batchSize) {
      this.flush();
    }
  }

  trackPageView() {
    this.track('page_view', {
      title: document.title,
      path: window.location.pathname,
    });
  }

  trackClick(element, extraData = {}) {
    const data = {
      tagName: element.tagName,
      id: element.id,
      className: element.className,
      text: element.innerText?.substring(0, 100),
      ...extraData,
    };
    this.track('click', data);
  }

  trackError(error, extraData = {}) {
    const data = {
      message: error.message,
      stack: error.stack,
      ...extraData,
    };
    this.track('error', data);
  }

  trackPerformance() {
    if (!window.performance) return;

    const timing = window.performance.timing;
    const data = {
      dns: timing.domainLookupEnd - timing.domainLookupStart,
      tcp: timing.connectEnd - timing.connectStart,
      request: timing.responseEnd - timing.requestStart,
      domParse: timing.domInteractive - timing.responseEnd,
      domReady: timing.domContentLoadedEventEnd - timing.fetchStart,
      loadComplete: timing.loadEventEnd - timing.fetchStart,
    };
    this.track('performance', data);
  }

  flush(sync = false) {
    if (this.queue.length === 0) return;

    const data = [...this.queue];
    this.queue = [];

    if (sync) {
      // 同步发送（页面卸载时使用 sendBeacon）
      if (navigator.sendBeacon) {
        navigator.sendBeacon(this.endpoint, JSON.stringify(data));
      } else {
        this.sendSync(data);
      }
    } else {
      // 异步发送
      this.sendAsync(data);
    }
  }

  sendAsync(data) {
    fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    }).catch(err => {
      console.error('Tracker send failed:', err);
    });
  }

  sendSync(data) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', this.endpoint, false);
    xhr.setRequestHeader('Content-Type', 'application/json');
    try {
      xhr.send(JSON.stringify(data));
    } catch (err) {
      console.error('Tracker sync send failed:', err);
    }
  }

  setUserId(userId) {
    this.userId = userId;
  }

  destroy() {
    this.enabled = false;
    if (this.timer) {
      clearInterval(this.timer);
    }
    this.flush(true);
  }
}

// 全局自动追踪点击事件的辅助函数
export function autoTrackClicks(tracker, selector = 'button, a, [data-track]') {
  document.addEventListener('click', (e) => {
    const target = e.target.closest(selector);
    if (target) {
      const trackData = target.dataset.track ? JSON.parse(target.dataset.track) : {};
      tracker.trackClick(target, trackData);
    }
  });
}

// 全局自动追踪错误的辅助函数
export function autoTrackErrors(tracker) {
  window.addEventListener('error', (e) => {
    tracker.trackError(e.error || new Error(e.message), {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    tracker.trackError(new Error(e.reason), {
      type: 'unhandledRejection',
    });
  });
}

export default Tracker;

/**
 * ==========================================
 * 埋点 SDK 实现原理解析
 * ==========================================
 *
 * 一、核心设计思想
 *
 * 1. 队列缓存机制（Queue Pattern）
 *    - 问题：每次事件都立即发送请求会造成性能问题和服务器压力
 *    - 方案：使用 this.queue 数组缓存埋点数据
 *    - 原理：track() 方法只是将数据 push 到队列，不立即发送
 *    - 优势：减少 HTTP 请求次数，提升页面性能
 *
 * 2. 批量上报机制（Batch Sending）
 *    - 触发条件1：队列达到 batchSize（默认10条）时自动上报
 *    - 触发条件2：定时器 autoFlushInterval（默认5秒）触发上报
 *    - 触发条件3：页面卸载（beforeunload）强制上报剩余数据
 *    - 实现：flush() 方法统一处理上报逻辑
 *
 * 3. 会话标识机制（Session ID）
 *    - 生成：时间戳 + 随机字符串，确保唯一性
 *    - 作用：追踪同一用户的连续行为，分析用户路径
 *    - 生命周期：SDK 实例化时生成，页面刷新重新生成
 *
 *
 * 二、关键技术实现
 *
 * 1. 数据收集层
 *    getCommonData() - 收集所有埋点共享的基础信息
 *    ├── 身份信息：appId（应用）、userId（用户）、sessionId（会话）
 *    ├── 页面信息：url（当前页）、referrer（来源页）
 *    ├── 环境信息：userAgent（浏览器）、分辨率（设备）
 *    └── 时间信息：timestamp（精确到毫秒）
 *
 * 2. 数据上报层
 *    异步上报（sendAsync）
 *    - 使用 fetch API 发送 POST 请求
 *    - 适用场景：正常业务流程中的埋点
 *    - 优点：不阻塞主线程，用户体验好
 *
 *    同步上报（sendSync）
 *    - 使用 XMLHttpRequest 同步请求（async: false）
 *    - 适用场景：页面卸载时（beforeunload）的埋点
 *    - 问题：会阻塞页面关闭，用户体验差
 *
 *    Beacon 上报（navigator.sendBeacon）
 *    - 浏览器原生 API，专为页面卸载设计
 *    - 优点：异步发送，不阻塞页面关闭，数据不丢失
 *    - 原理：浏览器会在后台完成请求，即使页面已关闭
 *    - 兼容性：现代浏览器都支持，降级到 sendSync
 *
 * 3. 性能监控层（trackPerformance）
 *    使用 window.performance.timing API 获取页面性能指标
 *    - dns：DNS 查询耗时
 *    - tcp：TCP 连接耗时
 *    - request：请求响应耗时
 *    - domParse：DOM 解析耗时
 *    - domReady：DOM 就绪时间
 *    - loadComplete：页面完全加载时间
 *
 * 4. 事件委托机制（autoTrackClicks）
 *    - 原理：利用事件冒泡，在 document 上监听所有点击
 *    - 优势：只需一个监听器，支持动态添加的元素
 *    - 实现：e.target.closest(selector) 查找匹配的父元素
 *    - 扩展：支持 data-track 属性自定义埋点数据
 *
 * 5. 全局错误捕获
 *    - window.error 事件：捕获同步代码错误和资源加载错误
 *    - window.unhandledrejection 事件：捕获未处理的 Promise 错误
 *    - 收集信息：错误消息、堆栈、文件名、行号、列号
 *
 *
 * 三、数据流转过程
 *
 * 1. 初始化阶段
 *    new Tracker(options)
 *    → 生成 sessionId
 *    → 初始化队列和配置
 *    → 启动定时器
 *    → 自动追踪首次 PV
 *
 * 2. 数据采集阶段
 *    用户行为发生（点击/浏览/错误）
 *    → 调用 track(eventName, eventData)
 *    → 合并通用数据 + 事件数据
 *    → push 到队列
 *    → 检查队列长度是否达到 batchSize
 *
 * 3. 数据上报阶段
 *    触发上报条件
 *    → flush() 复制队列并清空
 *    → 判断同步/异步上报
 *    → 发送 HTTP 请求
 *    → 后端接收并存储
 *
 * 4. 页面卸载阶段
 *    beforeunload 事件触发
 *    → flush(true) 同步上报
 *    → 优先使用 sendBeacon
 *    → 降级使用同步 XHR
 *    → 确保数据不丢失
 *
 *
 * 四、设计优势
 *
 * 1. 性能优化
 *    - 批量上报减少请求次数（10条数据 = 1次请求）
 *    - 异步发送不阻塞用户操作
 *    - sendBeacon 保证页面关闭流畅
 *
 * 2. 数据完整性
 *    - 队列机制防止数据丢失
 *    - beforeunload 确保上报未发送数据
 *    - sessionId 保证行为路径可追踪
 *
 * 3. 可扩展性
 *    - 插件化设计（autoTrackClicks、autoTrackErrors）
 *    - 配置灵活（batchSize、interval 可调）
 *    - 支持自定义事件
 *
 * 4. 生产可用性
 *    - enabled 开关控制开启/关闭
 *    - 错误处理避免影响主业务
 *    - destroy() 方法支持资源清理
 *
 *
 * 五、实际应用场景
 *
 * 1. 用户行为分析
 *    - 追踪用户访问路径（PV）
 *    - 分析点击热力图（Click）
 *    - 统计功能使用频率（Custom Event）
 *
 * 2. 性能监控
 *    - 页面加载时间分析
 *    - 找出性能瓶颈（DNS/TCP/DOM）
 *    - A/B 测试性能对比
 *
 * 3. 错误监控
 *    - 发现线上 JavaScript 错误
 *    - 追踪错误发生环境和路径
 *    - 错误聚合和报警
 *
 * 4. 业务数据
 *    - 电商：商品浏览、加购、下单
 *    - 内容：文章阅读时长、分享次数
 *    - 表单：填写步骤、放弃率
 *
 *
 * 六、后续优化方向
 *
 * 1. 数据压缩：使用 gzip/brotli 减少传输体积
 * 2. 离线存储：使用 localStorage/IndexedDB 缓存，网络恢复后上报
 * 3. 采样上报：高频事件按比例采样（如滚动事件）
 * 4. 数据加密：敏感信息加密后上报
 * 5. 智能合并：相同事件在短时间内合并为一条
 * 6. 性能指标：接入 PerformanceObserver API 获取更详细指标
 * 7. 用户画像：结合设备指纹、IP 等信息
 */
