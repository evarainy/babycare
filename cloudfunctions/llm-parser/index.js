const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const SYSTEM_PROMPT = `你是育婴记录助手。从用户输入提取多条育婴记录，返回JSON数组。

记录类型：
- breastfeeding:亲喂(左/右/双侧)，只记录时长(分钟)，无量
- bottle:瓶喂(奶粉/母乳/水/补剂)，记录ml量
- food:辅食，记录g量
- swimming:游泳，记录时长(分钟)
- diaper:换尿布
- sleep:睡眠，记录时长(分钟)
- other:其他

返回格式：[{"type":"类型","amount":数字或null,"side":"左|右|双"或null,"feedingType":"奶粉|母乳|水|补剂"或null,"duration":数字或null,"note":"备注","recordTime":"HH:mm"或null,"confidence":0-1,"needConfirm":true|false}]

规则：
1.亲喂未说明左右则默认双侧
2.瓶喂未说明类型则默认奶粉
3.时间按顺序推断：根据当前时间+文本中的相对时间(早上8点、12点、下午2点、5点等)
4.一条记录一个JSON对象，多条记录返回数组

示例：
"奶粉150" → [{"type":"bottle","amount":150,"side":null,"feedingType":"奶粉","duration":null,"note":"","recordTime":null,"confidence":0.9,"needConfirm":false}]
"亲喂20分钟" → [{"type":"breastfeeding","amount":null,"side":"双","feedingType":null,"duration":20,"note":"","recordTime":null,"confidence":0.9,"needConfirm":false}]
"游泳20分钟" → [{"type":"swimming","amount":null,"side":null,"feedingType":null,"duration":20,"note":"","recordTime":null,"confidence":0.9,"needConfirm":false}]
"今天早上8点喂了80的奶粉然后拉了屎，12点亲喂了20分钟" → [{"type":"bottle","amount":80,"side":null,"feedingType":"奶粉","duration":null,"note":"","recordTime":"08:00","confidence":0.9,"needConfirm":false},{"type":"diaper","amount":null,"side":null,"feedingType":null,"duration":null,"note":"","recordTime":"08:05","confidence":0.9,"needConfirm":false},{"type":"breastfeeding","amount":null,"side":"双","feedingType":null,"duration":20,"note":"","recordTime":"12:00","confidence":0.9,"needConfirm":false}]`

exports.main = async (event, context) => {
  const t0 = Date.now()
  const perf = { 
    start: t0,
    stages: {},
    total: 0
  }
  
  console.log('[PERF] 函数启动, t=0ms')

  const { text, currentTime, testNetwork, profile } = event

  if (testNetwork) {
    return await testNetworkAccess()
  }

  if (event.testAPI) {
    return await testAPICall()
  }

  if (!text || text.trim() === '') {
    return { code: 400, message: '输入文本不能为空' }
  }

  const t1 = Date.now()
  perf.stages.init = t1 - t0
  console.log(`[PERF] 参数检查完成, t=${t1 - t0}ms`)

  const fallback = fallbackParse(text, currentTime)
  const t2 = Date.now()
  perf.stages.fallback = t2 - t1
  console.log(`[PERF] fallback解析完成, t=${t2 - t0}ms, 记录数=${fallback.length}`)

  const apiKey = process.env.LLM_API_KEY
  const baseURL = process.env.LLM_BASE_URL
  const model = process.env.LLM_MODEL || 'qwen-turbo'

  const t3 = Date.now()
  perf.stages.envRead = t3 - t2
  console.log(`[PERF] 环境变量读取完成, t=${t3 - t0}ms`)

  if (!apiKey || !baseURL) {
    console.log('LLM未配置，使用规则解析')
    return { code: 0, data: fallback, rawText: text, fallback: true, reason: 'LLM未配置', perf }
  }

  try {
    const userMessage = currentTime
      ? `当前时间：${currentTime}\n用户输入：${text}`
      : `用户输入：${text}`

    console.log('[PERF] 开始调用LLM API...')
    const apiStartTime = Date.now()
    
    const apiResult = await callLLMWithPerf(baseURL, apiKey, model, userMessage)
    
    const t4 = Date.now()
    perf.stages.apiCall = t4 - apiStartTime
    perf.stages.apiDetail = apiResult.perf
    console.log(`[PERF] LLM API调用完成, t=${t4 - t0}ms, API耗时=${apiResult.perf.total}ms`)
    console.log(`[PERF] API详情: DNS=${apiResult.perf.dns}ms, 连接=${apiResult.perf.connect}ms, 首字节=${apiResult.perf.ttfb}ms, 下载=${apiResult.perf.download}ms`)

    const result = apiResult.content
    console.log(`LLM结果:`, result.substring(0, 200))

    const t5 = Date.now()
    let parsed = extractJson(result)
    perf.stages.jsonParse = t5 - t4
    console.log(`[PERF] JSON解析完成, t=${t5 - t0}ms`)

    if (!parsed) {
      console.log('JSON解析失败，使用fallback')
      perf.total = Date.now() - t0
      return { code: 0, data: fallback, rawText: text, fallback: true, reason: 'LLM返回格式错误', perf }
    }

    if (!Array.isArray(parsed)) {
      parsed = [parsed]
    }

    for (const record of parsed) {
      if (record.amount && typeof record.amount === 'string') {
        record.amount = parseFloat(record.amount) || null
      }
      if (record.duration && typeof record.duration === 'string') {
        record.duration = parseFloat(record.duration) || null
      }
    }

    console.log('解析成功，记录数:', parsed.length)

    perf.total = Date.now() - t0
    perf.stages.finalize = perf.total - (t5 - t0)
    
    console.log(`[PERF] 总耗时: ${perf.total}ms`)
    console.log(`[PERF] 阶段明细: init=${perf.stages.init}ms, fallback=${perf.stages.fallback}ms, env=${perf.stages.envRead}ms, api=${perf.stages.apiCall}ms, json=${perf.stages.jsonParse}ms`)

    return {
      code: 0,
      data: parsed,
      rawText: text,
      perf: perf
    }
  } catch (err) {
    console.error('LLM调用错误:', err.message)
    perf.total = Date.now() - t0
    return { code: 0, data: fallback, rawText: text, fallback: true, reason: err.message, perf }
  }
}

function callLLMWithPerf(baseURL, apiKey, model, userMessage) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now()
    const perf = {
      dns: 0,
      connect: 0,
      ttfb: 0,
      download: 0,
      total: 0
    }
    
    let url
    try {
      url = new URL(baseURL)
    } catch (e) {
      return reject(new Error('无效的API地址: ' + baseURL))
    }
    
    const requestBody = {
      model: model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.1,
      max_tokens: 500,
      stream: false,
      response_format: { type: 'json_object' },
      enable_thinking: false
    }

    const postData = JSON.stringify(requestBody)
    
    const apiPath = url.pathname.replace(/\/$/, '') + '/chat/completions'
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: apiPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    }

    console.log(`[PERF] HTTP请求准备完成, t=${Date.now() - t0}ms`)

    let resolved = false
    let timer = null
    let connectTime = 0
    let firstChunkTime = 0
    
    const req = https.request(options, (res) => {
      firstChunkTime = Date.now()
      perf.connect = connectTime > 0 ? connectTime - t0 : firstChunkTime - t0
      console.log(`[PERF] 收到响应头, statusCode=${res.statusCode}, 连接耗时=${perf.connect}ms`)
      
      let data = ''
      let chunkCount = 0
      
      res.on('data', (chunk) => {
        if (chunkCount === 0) {
          perf.ttfb = Date.now() - firstChunkTime
          console.log(`[PERF] 首字节到达, TTFB=${perf.ttfb}ms`)
        }
        chunkCount++
        data += chunk
      })
      
      res.on('end', () => {
        if (resolved) return
        resolved = true
        if (timer) clearTimeout(timer)
        
        const t1 = Date.now()
        perf.download = t1 - firstChunkTime - perf.ttfb
        perf.total = t1 - t0
        
        console.log(`[PERF] 响应完成, 数据长度=${data.length}, 下载耗时=${perf.download}ms`)
        console.log('HTTP响应状态:', res.statusCode, '数据长度:', data.length)
        
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data)
            const content = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content
            if (content) {
              resolve({ content, perf })
            } else {
              console.error('响应结构:', JSON.stringify(json).substring(0, 300))
              reject(new Error('响应中无content字段'))
            }
          } catch (e) {
            reject(new Error('JSON解析失败: ' + data.substring(0, 200)))
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 500)}`))
        }
      })
    })

    req.on('socket', (socket) => {
      socket.on('lookup', () => {
        perf.dns = Date.now() - t0
        console.log(`[PERF] DNS解析完成, 耗时=${perf.dns}ms`)
      })
      socket.on('connect', () => {
        connectTime = Date.now()
        console.log(`[PERF] TCP连接建立, 耗时=${connectTime - t0}ms`)
      })
    })

    req.on('error', (err) => {
      if (resolved) return
      resolved = true
      if (timer) clearTimeout(timer)
      console.error('HTTP请求错误:', err.message)
      reject(err)
    })

    timer = setTimeout(() => {
      if (resolved) return
      resolved = true
      console.error('HTTP请求超时(15s)')
      req.destroy()
      reject(new Error('请求超时(15s)'))
    }, 15000)

    req.write(postData)
    req.end()
    
    console.log(`[PERF] HTTP请求已发送, t=${Date.now() - t0}ms`)
  })
}

async function testNetworkAccess() {
  const results = []
  
  const tests = [
    { name: '百度', url: 'https://www.baidu.com' },
    { name: '阿里云DashScope', url: 'https://dashscope.aliyuncs.com' }
  ]
  
  for (const test of tests) {
    const result = await testHttpsGet(test.url, test.name)
    results.push(result)
  }
  
  return {
    code: 0,
    message: '网络测试完成',
    results: results,
    timestamp: new Date().toISOString()
  }
}

async function testAPICall() {
  const apiKey = process.env.LLM_API_KEY
  const baseURL = process.env.LLM_BASE_URL
  const model = process.env.LLM_MODEL || 'qwen-turbo'
  
  if (!apiKey || !baseURL) {
    return { code: 400, message: 'API配置缺失' }
  }
  
  const url = new URL(baseURL)
  const apiPath = url.pathname.replace(/\/$/, '') + '/chat/completions'
  
  const requestBody = {
    model: model,
    messages: [
      { role: 'user', content: '你好' }
    ],
    max_tokens: 10
  }
  
  const postData = JSON.stringify(requestBody)
  
  return new Promise((resolve) => {
    const startTime = Date.now()
    let resolved = false
    
    const timer = setTimeout(() => {
      if (resolved) return
      resolved = true
      resolve({
        code: -1,
        message: 'API调用超时(10s)',
        duration: Date.now() - startTime,
        config: {
          hostname: url.hostname,
          path: apiPath,
          model: model,
          apiKeyPrefix: apiKey.substring(0, 10) + '...'
        }
      })
    }, 10000)
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: apiPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    }
    
    console.log('testAPI - 请求配置:', JSON.stringify(options))
    
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        
        console.log('testAPI - 响应:', res.statusCode, data)
        
        resolve({
          code: 0,
          message: 'API调用完成',
          duration: Date.now() - startTime,
          statusCode: res.statusCode,
          response: data.substring(0, 1000),
          config: {
            hostname: url.hostname,
            path: apiPath,
            model: model
          }
        })
      })
    })
    
    req.on('error', (err) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      console.error('testAPI - 错误:', err.message)
      resolve({
        code: -1,
        message: 'API调用错误: ' + err.message,
        duration: Date.now() - startTime,
        error: err.message
      })
    })
    
    req.write(postData)
    req.end()
  })
}

function testHttpsGet(url, name) {
  return new Promise((resolve) => {
    const startTime = Date.now()
    let resolved = false
    
    const timer = setTimeout(() => {
      if (resolved) return
      resolved = true
      resolve({
        name: name,
        url: url,
        status: 'timeout',
        duration: Date.now() - startTime,
        error: '请求超时(5s)'
      })
    }, 5000)
    
    https.get(url, (res) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        resolve({
          name: name,
          url: url,
          status: 'success',
          statusCode: res.statusCode,
          duration: Date.now() - startTime,
          dataLength: data.length
        })
      })
    }).on('error', (err) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      resolve({
        name: name,
        url: url,
        status: 'error',
        duration: Date.now() - startTime,
        error: err.message
      })
    })
  })
}

function extractJson(content) {
  if (!content || typeof content !== 'string') return null
  
  const trimmed = content.trim()
  
  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed
    if (typeof parsed === 'object') return [parsed]
    return null
  } catch (e) {}

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      return JSON.parse(trimmed)
    } catch (e) {}
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed)
      return [obj]
    } catch (e) {}
  }

  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim())
      if (Array.isArray(parsed)) return parsed
      if (typeof parsed === 'object') return [parsed]
    } catch (e) {}
  }

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0])
      return [obj]
    } catch (e) {}
  }

  return null
}

function inferTimeFromText(text, currentTime) {
  const now = new Date(currentTime || Date.now())
  
  const timePatterns = [
    { regex: /(\d{1,2})[:点时](\d{0,2})/, priority: 1 },
    { regex: /早上(\d{1,2})[:点时]?(\d{0,2})?/, priority: 2, hourOffset: 0 },
    { regex: /上午(\d{1,2})[:点时]?(\d{0,2})?/, priority: 2, hourOffset: 0 },
    { regex: /中午(\d{1,2})[:点时]?(\d{0,2})?/, priority: 2, hourOffset: 0 },
    { regex: /下午(\d{1,2})[:点时]?(\d{0,2})?/, priority: 2, hourOffset: 12 },
    { regex: /傍晚(\d{1,2})[:点时]?(\d{0,2})?/, priority: 2, hourOffset: 18 },
    { regex: /晚上(\d{1,2})[:点时]?(\d{0,2})?/, priority: 2, hourOffset: 18 }
  ]

  for (const pattern of timePatterns) {
    const match = text.match(pattern.regex)
    if (match) {
      let hour = parseInt(match[1])
      const minute = match[2] ? parseInt(match[2]) : 0
      
      if (pattern.hourOffset !== undefined) {
        hour += pattern.hourOffset
      }
      
      if (hour >= 24) hour -= 24
      
      const recordDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute)
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`
    }
  }

  return null
}

function fallbackParse(text, currentTime) {
  const records = []
  const segments = text.split(/[，,、；;。]/).filter(s => s.trim())
  
  for (const segment of segments) {
    const result = {
      type: 'bottle',
      amount: null,
      side: null,
      feedingType: null,
      duration: null,
      note: '',
      recordTime: null,
      confidence: 0.5,
      needConfirm: true
    }

    result.recordTime = inferTimeFromText(segment, currentTime)

    const amountMatch = segment.match(/(\d+(?:\.\d+)?)\s*(?:ml|毫升|ML|g|克)?/)
    if (amountMatch) {
      result.amount = parseFloat(amountMatch[1])
      if (segment.includes('g') || segment.includes('克')) {
        result.type = 'food'
      }
    }

    if (segment.includes('左')) result.side = '左'
    else if (segment.includes('右')) result.side = '右'
    else if (segment.includes('双')) result.side = '双'

    if (segment.includes('奶粉')) result.feedingType = '奶粉'
    else if (segment.includes('母乳')) result.feedingType = '母乳'
    else if (segment.includes('水')) result.feedingType = '水'
    else if (segment.includes('补剂')) result.feedingType = '补剂'
    else if (result.amount && !result.feedingType) result.feedingType = '奶粉'

    if (segment.includes('亲喂') || (segment.includes('喂') && !result.amount)) {
      result.type = 'breastfeeding'
      result.side = result.side || '双'
      result.feedingType = null
      const durationMatch = segment.match(/(\d+)\s*(?:分钟|min)/)
      if (durationMatch) result.duration = parseInt(durationMatch[1])
    } else if (segment.includes('游泳')) {
      result.type = 'swimming'
      result.amount = null
      const durationMatch = segment.match(/(\d+)\s*(?:分钟|min)/)
      if (durationMatch) result.duration = parseInt(durationMatch[1])
    } else if (segment.includes('尿布') || segment.includes('屎') || segment.includes('拉')) {
      result.type = 'diaper'
      result.amount = null
      result.feedingType = null
    } else if (segment.includes('睡') || segment.includes('觉')) {
      result.type = 'sleep'
      result.amount = null
      result.feedingType = null
      const durationMatch = segment.match(/(\d+)\s*(?:分钟|min)/)
      if (durationMatch) result.duration = parseInt(durationMatch[1])
    }

    if (result.type !== 'diaper' && result.type !== 'sleep') {
      result.note = segment.trim()
    }

    records.push(result)
  }

  return records.length > 0 ? records : [{
    type: 'other',
    amount: null,
    side: null,
    feedingType: null,
    duration: null,
    note: text,
    recordTime: null,
    confidence: 0.3,
    needConfirm: true
  }]
}
