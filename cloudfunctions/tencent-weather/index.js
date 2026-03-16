const cloud = require('wx-server-sdk')
const https = require('https')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const QQ_MAP_KEY = process.env.QQ_MAP_KEY || 'UCJBZ-GZQEI-SWWG6-UHPS4-CISMK-ATF5Y'
const QQ_MAP_SK = process.env.QQ_MAP_SK || 'JQeQmfa1CBfYc5csx6E90rtw356kiuOe'

exports.main = async (event = {}) => {
  const { action = 'getCurrentWeather', location = {}, city = '', district = '', province = '' } = event
  console.log('[tencent-weather] action:', action, 'location:', location)

  if (!QQ_MAP_KEY || !QQ_MAP_SK) {
    return {
      code: 500,
      message: '缺少腾讯位置服务 WebService Key 或 SK，请配置 QQ_MAP_KEY / QQ_MAP_SK'
    }
  }

  if (action === 'getSignedIpUrl') {
    return {
      code: 0,
      data: {
        url: buildSignedUrl('/ws/location/v1/ip', { key: QQ_MAP_KEY, output: 'json' })
      }
    }
  }

  if (action === 'getWeatherByLocation') {
    if (!location || location.lat === undefined || location.lng === undefined) {
      return { code: 400, message: '缺少经纬度' }
    }
    const weather = await fetchWeatherByLocation(location, { city, district, province })
    return { code: 0, data: weather }
  }

  const ipLocation = await fetchIpLocation()
  if (!ipLocation.location) {
    return { code: 500, message: '获取 IP 位置失败' }
  }

  const weather = await fetchWeatherByLocation(ipLocation.location, ipLocation)
  return { code: 0, data: weather }
}

function buildQuery(params, shouldEncode = true) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => {
      const value = shouldEncode ? encodeURIComponent(params[key]) : String(params[key])
      return `${key}=${value}`
    })
    .join('&')
}

function buildSig(path, params) {
  const query = buildQuery(params, false)
  return crypto
    .createHash('md5')
    .update(`${path}?${query}${QQ_MAP_SK}`, 'utf8')
    .digest('hex')
}

function buildSignedUrl(path, params) {
  const query = buildQuery(params, true)
  const sig = buildSig(path, params)
  return `https://apis.map.qq.com${path}?${query}&sig=${sig}`
}

function httpsGetJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let raw = ''
        res.on('data', (chunk) => {
          raw += chunk
        })
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`))
            return
          }

          try {
            const parsed = JSON.parse(raw)
            if (parsed && parsed.status !== undefined && Number(parsed.status) !== 0) {
              reject(new Error(`腾讯接口返回异常 status=${parsed.status} message=${parsed.message || ''}`))
              return
            }
            resolve(parsed)
          } catch (err) {
            reject(new Error(`天气接口返回非 JSON: ${raw.slice(0, 200)}`))
          }
        })
      })
      .on('error', reject)
  })
}

async function fetchIpLocation() {
  const payload = await httpsGetJson(buildSignedUrl('/ws/location/v1/ip', { key: QQ_MAP_KEY, output: 'json' }))
  return {
    location: payload && payload.result && payload.result.location,
    city: payload && payload.result && payload.result.ad_info && payload.result.ad_info.city,
    district: payload && payload.result && payload.result.ad_info && payload.result.ad_info.district,
    province: payload && payload.result && payload.result.ad_info && payload.result.ad_info.province
  }
}

function normalizeHumidity(value) {
  if (value === undefined || value === null || value === '') return '--'
  return String(value).includes('%') ? String(value) : `${value}%`
}

function getWeatherIconPath(weatherText = '') {
  const text = String(weatherText || '')
  if (/雷|暴雨|雷阵雨|强对流|冰雹/.test(text)) return '/assets/icons/weather-thunder.svg'
  if (/雪|雨夹雪|冻雨/.test(text)) return '/assets/icons/weather-snow.svg'
  if (/霾|扬沙|浮尘|沙尘/.test(text)) return '/assets/icons/weather-haze.svg'
  if (/雾|轻雾|浓雾/.test(text)) return '/assets/icons/weather-fog.svg'
  if (/阴/.test(text)) return '/assets/icons/weather-overcast.svg'
  if (/风|大风|飓风|龙卷/.test(text)) return '/assets/icons/weather-windy.svg'
  if (/暴雨|大雨|中雨|小雨|阵雨|雨/.test(text)) return '/assets/icons/weather-rainy.svg'
  if (/多云|少云|晴间多云|云/.test(text)) return '/assets/icons/weather-cloudy.svg'
  return '/assets/icons/weather-sunny.svg'
}

function buildAdvice(weatherText, temperature) {
  if (/霾|扬沙|浮尘|沙尘/.test(weatherText)) return '空气质量一般，外出尽量缩短时长并做好防护。'
  if (/雾|轻雾|浓雾/.test(weatherText)) return '能见度偏低，外出注意保暖和出行安全。'
  if (/雨/.test(weatherText)) return '出门记得带雨具，注意保暖和擦汗。'
  if (temperature >= 30) return '天气偏热，外出注意遮阳和补水。'
  if (temperature <= 10) return '天气偏凉，外出记得加一层衣物。'
  if (/阴|云/.test(weatherText)) return '适合短时外出，注意早晚温差。'
  return '适合外出活动，注意补水和防晒。'
}

function pickRealtime(result = {}) {
  if (Array.isArray(result.realtime) && result.realtime.length) {
    const candidate = result.realtime[0]
    return candidate.infos || candidate
  }
  if (result.observe) return result.observe
  if (result.realtime && !Array.isArray(result.realtime)) return result.realtime.infos || result.realtime
  return {}
}

function pickForecast(result = {}) {
  if (Array.isArray(result.daily) && result.daily.length) {
    return result.daily[0]
  }
  if (Array.isArray(result.forecast) && result.forecast.length) {
    return result.forecast[0]
  }
  if (Array.isArray(result.forecasts) && result.forecasts.length) {
    const candidate = result.forecasts[0]
    return candidate.infos || candidate
  }
  return {}
}

function formatTemperatureText(current, low, high) {
  const currentValid = Number.isFinite(current)
  const lowValid = Number.isFinite(low)
  const highValid = Number.isFinite(high)

  if (lowValid && highValid) return `${low}/${high}°C`
  if (currentValid) return `${current}°C`
  return '--'
}

async function fetchWeatherByLocation(location, areaInfo = {}) {
  const url = buildSignedUrl('/ws/weather/v1/', {
    key: QQ_MAP_KEY,
    location: `${location.lat},${location.lng}`,
    type: 'now',
    output: 'json'
  })
  console.log('[tencent-weather] weather request url:', url.replace(QQ_MAP_KEY, '***'))
  const payload = await httpsGetJson(url)
  const result = payload && payload.result ? payload.result : {}
  const realtime = pickRealtime(result)
  const forecast = pickForecast(result)
  const weather = realtime.weather || realtime.text || realtime.phrase || '晴'
  const temperature = Number(realtime.temperature || realtime.temp || realtime.degree || 0)
  const lowTemperature = Number(
    forecast.min_temp
      || forecast.minTemp
      || forecast.low
      || forecast.lowest
      || forecast.night_temp
      || NaN
  )
  const highTemperature = Number(
    forecast.max_temp
      || forecast.maxTemp
      || forecast.high
      || forecast.highest
      || forecast.day_temp
      || NaN
  )
  const humidity = realtime.humidity || realtime.humid || realtime.humidity_desc || '--'
  const city = areaInfo.city || (result.ad_info && result.ad_info.city) || ''
  const district = areaInfo.district || (result.ad_info && result.ad_info.district) || ''
  const province = areaInfo.province || (result.ad_info && result.ad_info.province) || ''

  return {
    weather,
    city,
    district,
    province,
    temperature,
    lowTemperature: Number.isFinite(lowTemperature) ? lowTemperature : null,
    highTemperature: Number.isFinite(highTemperature) ? highTemperature : null,
    temperatureText: formatTemperatureText(
      Number.isFinite(temperature) ? temperature : NaN,
      Number.isFinite(lowTemperature) ? lowTemperature : NaN,
      Number.isFinite(highTemperature) ? highTemperature : NaN
    ),
    humidityText: normalizeHumidity(humidity),
    advice: buildAdvice(weather, temperature),
    iconPath: getWeatherIconPath(weather),
    updateTime: Date.now(),
    location
  }
}
