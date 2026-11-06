# 其他壁纸来源调查

核实日期：2026-11-06。以下是官方文档调查，不代表已完成接入或国内网络稳定性测试。

| 来源 | 内容方向 | 结论与条件 |
|---|---|---|
| NASA Image and Video Library | 地球、太空、星云、航天 | 值得优先评估。[官方 API](https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf) 可提供媒体信息；按 [媒体使用指南](https://www.nasa.gov/nasa-brand-center/images-and-media/) 逐图核对 credit / copyright。网站也收录第三方图片，不能一概视为公共领域；不能暗示 NASA 为本软件背书。 |
| Openverse | 摄影、风景、插画，多来源聚合 | [API](https://api.openverse.org/v1/) 支持按 CC0、公共领域、CC BY、CC BY-SA 等许可筛选，返回作者与来源。它是发现入口，不是原图版权方；需回源核实许可和下载规则。[条款](https://docs.openverse.org/terms_of_service) 明确不保证所索引内容的许可状态。 |
| The Met Open Access | 古典绘画、版画、艺术专题 | [官方 API](https://metmuseum.github.io/) 提供开放馆藏与高清图片；只选择符合 Open Access / public-domain 条件的记录，核对 `isPublicDomain` 和图片地址。适合独立艺术分类。 |
| Smithsonian Open Access | 艺术、自然史、历史影像 | [官方 FAQ](https://www.si.edu/openaccess/faq) 提供 CC0 媒体的复用条件。只取明确标记 CC0 的媒体；元数据开放不等于所有对应图片都开放。官方 API 需注册 key，也有开放数据。 |
| Art Institute of Chicago | 油画、艺术作品 | [API 文档](https://api.artic.edu/docs/) 支持筛选 `is_public_domain=true`，也允许按指南本地下载：串行获取，建议每张间隔 1 秒。 |
| Unsplash | 高质量摄影 | [官方 API Guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines) 限制复制其核心体验，明确举例包含壁纸应用。暂不默认接入，需要适用于本产品的明确许可。 |
| Pexels | 摄影、视频 | [API 文档](https://www.pexels.com/api/documentation/) 与 [条款说明](https://help.pexels.com/hc/en-us/articles/900005880463-What-are-the-Terms-and-Conditions) 限制以基本未修改的形式作为壁纸分发，以及构建类似或竞争服务。本产品以壁纸为主要用途，暂不默认接入。 |
| Pixabay | 摄影、插画 | [API 文档](https://pixabay.com/api/docs/) 要求 API 请求结果缓存 24 小时，禁止系统性大量下载。该缓存要求不等于允许软件无限积累并再分发图片库，需进一步核实产品用途与许可。 |
| Wallhaven | 壁纸社区 | [版权说明](https://www.whvn.cc/about) 指出内容由用户上传，图片仍归原所有者。API 可访问不等于每张图均获再分发授权，不能无差别自动缓存。 |

建议顺序：NASA 太空 / 地球专题 → Openverse 发现更多授权摄影 → 按需求增加开放艺术馆藏。NASA APOD 包含第三方天文摄影，也必须逐图确认：[官方说明](https://science.nasa.gov/apod/apod-about/)。

0.1.1 的真实每日下载先使用 Wikimedia Commons，保留作者、来源与 CC BY / CC BY-SA / CC0 许可信息。上述新增来源尚未接入，避免把搜索调查结果误认为已验证可用的图片源。
