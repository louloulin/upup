export type StockMarket = 'A' | 'HK' | 'US' | 'UNKNOWN';

export interface ParsedStockCode {
  market: StockMarket;
  code: string;
  tushareFormat: string;
  name?: string;
}

const A_SHARE_EXCHANGES: Record<string, string> = {
  '600': 'SH', '601': 'SH', '603': 'SH', '688': 'SH', '589': 'SH',
  '000': 'SZ', '001': 'SZ', '002': 'SZ', '003': 'SZ', '300': 'SZ', '301': 'SZ',
  '43': 'BJ', '83': 'BJ', '87': 'BJ', '88': 'BJ', '92': 'BJ',
};

const NAME_MAP: Record<string, string> = {
  // Shanghai Main Board (600xxx, 601xxx)
  '600519': '贵州茅台', '600036': '招商银行', '600900': '长江电力',
  '600276': '恒瑞医药', '600030': '中信证券', '601318': '中国平安',
  '601012': '隆基绿能', '600887': '伊利股份', '600028': '中国石化',
  '601857': '中国石油', '601166': '兴业银行', '601398': '工商银行',
  '601939': '建设银行', '601288': '农业银行', '601628': '中国人寿',
  '600016': '民生银行', '600048': '保利发展', '600031': '三一重工',
  '601668': '中国建筑', '600585': '海螺水泥', '600050': '中国联通',
  '600690': '海尔智家', '601888': '中国中免', '603259': '药明康德',
  '603501': '韦尔股份', '603288': '海天味业',
  '600309': '万华化学', '600882': '宝丰能源', '600132': '重庆啤酒',
  '600141': '兴发集团', '600346': '恒力石化', '601919': '中远海控',
  '600009': '上海机场', '600588': '用友网络', '600406': '国电南瑞',
  '600089': '特变电工', '600398': '海澜之家', '600104': '上汽集团',
  '600547': '山东黄金', '600570': '恒生电子', '600703': '三安光电',
  '600637': '东方明珠', '600745': '闻泰科技', '600760': '中航沈飞',
  '600809': '山西汾酒',
  // Shenzhen Main Board (000xxx)
  '000001': '平安银行', '000002': '万科A', '000333': '美的集团',
  '000651': '格力电器', '000858': '五粮液', '000725': '京东方A',
  '000876': '新希望', '000895': '双汇发展', '000568': '泸州老窖',
  '000596': '古井贡酒', '000538': '云南白药', '000063': '中兴通讯',
  '000100': 'TCL科技', '000661': '长春高新', '000708': '中信特钢',
  '000860': '顺鑫农业',
  // SME Board (002xxx)
  '002594': '比亚迪', '002415': '海康威视', '002460': '赣锋锂业',
  '002475': '立讯精密', '002371': '北方华创', '002230': '科大讯飞',
  '002049': '紫光国微', '002352': '顺丰控股', '002555': '三七互娱',
  '002456': '欧菲光', '002236': '大华股份', '002624': '完美世界',
  '002493': '荣盛石化', '002714': '牧原股份', '002601': '龙蟒佰利',
  '002027': '分众传媒', '002241': '歌尔股份', '002007': '华兰生物',
  '002044': '美年健康', '002304': '洋河股份', '002142': '宁波银行',
  // ChiNext (300xxx)
  '300750': '宁德时代', '300014': '亿纬锂能', '300015': '爱尔眼科',
  '300059': '东方财富', '300122': '智飞生物', '300124': '汇川技术',
  '300142': '沃森生物', '300274': '阳光电源', '300364': '中文在线',
  '300408': '三环集团', '300450': '先导智能', '300496': '中科创达',
  '300498': '温氏股份', '300760': '迈瑞医疗', '300847': '中船汉光',
  // STAR Market (688xxx)
  '688981': '中芯国际', '688008': '澜起科技', '688012': '中微公司',
  '688036': '传音控股', '688111': '金山办公', '688126': '沪硅产业',
  '688187': '时代电气', '688223': '晶科能源', '688233': '天能股份',
  '688256': '寒武纪', '688348': '昱能科技', '688363': '华熙生物',
  '688499': '利元亨', '688599': '天合光能', '688505': '复旦张江',
  '688180': '君实生物', '688521': '芯原股份',
  // HK stocks (5-digit)
  '00700': '腾讯控股', '09988': '阿里巴巴', '09999': '网易',
  '00941': '中国移动', '00992': '联想集团', '01810': '小米集团',
  '02020': '安踏体育', '02318': '中国平安', '02382': '舜宇光学',
  '02688': '新奥能源', '03690': '美团', '03888': '金山软件',
  '06160': '百济神州', '06618': '京东健康', '09618': '京东集团',
  '09888': '百度集团', '10284': '中国飞鹤', '09868': '小鹏汽车',
  '00772': '阅文集团', '02331': '李宁', '02880': '途虎养车',
};

export function parseStockCode(input: string): ParsedStockCode {
  const code = input.trim().toUpperCase();

  // Tushare format: 002594.SZ
  if (code.includes('.')) {
    const [pure, suffix] = code.split('.');
    if (['SH', 'SZ', 'BJ'].includes(suffix)) {
      return { market: 'A', code: pure, tushareFormat: code, name: NAME_MAP[pure] };
    }
    if (suffix === 'HK') {
      return { market: 'HK', code: pure, tushareFormat: code };
    }
    return { market: 'US', code: pure, tushareFormat: pure };
  }

  // HK prefix: HK00700, hk00700
  if (code.startsWith('HK')) {
    const pure = code.slice(2);
    return { market: 'HK', code: pure, tushareFormat: `${pure}.HK` };
  }

  // Chinese prefix: SH600519, SZ000001, BJ920748
  if (code.startsWith('SH') || code.startsWith('SHS')) {
    const pure = code.replace(/^SHS?/, '');
    return { market: 'A', code: pure, tushareFormat: `${pure}.SH`, name: NAME_MAP[pure] };
  }
  if (code.startsWith('SZ') || code.startsWith('SZS')) {
    const pure = code.replace(/^SZS?/, '');
    return { market: 'A', code: pure, tushareFormat: `${pure}.SZ`, name: NAME_MAP[pure] };
  }
  if (code.startsWith('BJ')) {
    const pure = code.slice(2);
    return { market: 'A', code: pure, tushareFormat: `${pure}.BJ`, name: NAME_MAP[pure] };
  }

  // 6-digit A-share code
  if (/^\d{6}$/.test(code)) {
    for (const [prefix, exchange] of Object.entries(A_SHARE_EXCHANGES)) {
      if (code.startsWith(prefix)) {
        return { market: 'A', code, tushareFormat: `${code}.${exchange}`, name: NAME_MAP[code] };
      }
    }
  }

  // 5-digit HK code
  if (/^\d{5}$/.test(code)) {
    return { market: 'HK', code, tushareFormat: `${code}.HK` };
  }

  // US ticker (letters)
  return { market: 'US', code, tushareFormat: code };
}

export function isAShare(input: string): boolean {
  return parseStockCode(input).market === 'A';
}

export function isHKStock(input: string): boolean {
  return parseStockCode(input).market === 'HK';
}