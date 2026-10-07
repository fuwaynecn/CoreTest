import type { AnswerSpec } from "./answer-spec";

type AffineValue = { constant: number; coefficient: number; hasVariable: boolean };
type NumberProof = { value: number; unit: string | null };
type ChoiceOption = { label: "A" | "B" | "C" | "D"; text: string };

function addAffine(left: AffineValue, right: AffineValue): AffineValue {
  return {
    constant: left.constant + right.constant,
    coefficient: left.coefficient + right.coefficient,
    hasVariable: left.hasVariable || right.hasVariable,
  };
}

function scaleAffine(value: AffineValue, factor: number): AffineValue {
  return {
    constant: value.constant * factor,
    coefficient: value.coefficient * factor,
    hasVariable: value.hasVariable,
  };
}

function multiplyAffine(left: AffineValue, right: AffineValue): AffineValue {
  if (left.hasVariable && right.hasVariable) throw new Error("Nonlinear term");
  return {
    constant: left.constant * right.constant,
    coefficient: left.coefficient * right.constant + left.constant * right.coefficient,
    hasVariable: left.hasVariable || right.hasVariable,
  };
}

function divideAffine(left: AffineValue, right: AffineValue): AffineValue {
  if (right.hasVariable || right.constant === 0) throw new Error("Invalid divisor");
  return scaleAffine(left, 1 / right.constant);
}

class AffineParser {
  private index = 0;

  constructor(private readonly expression: string) {}

  parse(): AffineValue {
    const value = this.parseExpression();
    this.skipSpaces();
    if (this.index !== this.expression.length) throw new Error("Unsupported token");
    return value;
  }

  private parseExpression(): AffineValue {
    let value = this.parseTerm();
    while (true) {
      this.skipSpaces();
      const operator = this.expression[this.index];
      if (operator !== "+" && operator !== "-") return value;
      this.index += 1;
      const next = this.parseTerm();
      value = addAffine(value, operator === "+" ? next : scaleAffine(next, -1));
    }
  }

  private parseTerm(): AffineValue {
    let value = this.parseFactor();
    while (true) {
      this.skipSpaces();
      const operator = this.expression[this.index];
      if (operator === "*" || operator === "/") {
        this.index += 1;
        const next = this.parseFactor();
        value = operator === "*" ? multiplyAffine(value, next) : divideAffine(value, next);
        continue;
      }
      if (operator === "x" || operator === "X" || operator === "(") {
        value = multiplyAffine(value, this.parseFactor());
        continue;
      }
      return value;
    }
  }

  private parseFactor(): AffineValue {
    this.skipSpaces();
    const character = this.expression[this.index];
    if (character === "+" || character === "-") {
      this.index += 1;
      const value = this.parseFactor();
      return character === "-" ? scaleAffine(value, -1) : value;
    }
    if (character === "x" || character === "X") {
      this.index += 1;
      return { constant: 0, coefficient: 1, hasVariable: true };
    }
    if (character === "(") {
      this.index += 1;
      const value = this.parseExpression();
      this.skipSpaces();
      if (this.expression[this.index] !== ")") throw new Error("Unclosed group");
      this.index += 1;
      return value;
    }

    const match = this.expression.slice(this.index).match(/^(?:\d+(?:\.\d+)?|\.\d+)/);
    if (!match) throw new Error("Expected value");
    this.index += match[0].length;
    return { constant: Number(match[0]), coefficient: 0, hasVariable: false };
  }

  private skipSpaces() {
    while (/\s/.test(this.expression[this.index] ?? "")) this.index += 1;
  }
}

function normalizeMath(expression: string): string {
  return expression.replaceAll("×", "*").replaceAll("÷", "/")
    .replaceAll("（", "(").replaceAll("）", ")").replaceAll("−", "-");
}

function compactMath(expression: string): string {
  return normalizeMath(expression).replace(/\s+/g, "");
}

function arithmeticValue(expression: string): number {
  const value = new AffineParser(normalizeMath(expression)).parse();
  if (value.hasVariable || !Number.isFinite(value.constant)) throw new Error("Not numeric");
  return value.constant;
}

function equationSolution(expression: string): number {
  const sides = expression.split("=");
  if (sides.length !== 2 || sides.some((side) => !side.trim())) throw new Error("Invalid equation");
  const left = new AffineParser(normalizeMath(sides[0])).parse();
  const right = new AffineParser(normalizeMath(sides[1])).parse();
  const difference = addAffine(left, scaleAffine(right, -1));
  if (![difference.constant, difference.coefficient].every(Number.isFinite)
    || Math.abs(difference.coefficient) < 1e-12) throw new Error("Equation is not uniquely affine");
  return -difference.constant / difference.coefficient;
}

function equationRequest(stem: string): { expression: string; unit: string | null } | null {
  let match = stem.match(/^解方程[：:]\s*(.+?)\s*[。.]$/);
  if (match) return { expression: match[1], unit: null };

  match = stem.match(/^某数加 (-?\d+(?:\.\d+)?) 后是 (-?\d+(?:\.\d+)?)。列方程 (.+?) 并求 x。$/);
  if (match && compactMath(match[3]) === compactMath(`x + ${match[1]} = ${match[2]}`)) {
    return { expression: match[3], unit: null };
  }

  match = stem.match(/^把一个数平均分成 (-?\d+(?:\.\d+)?) 份，每份是 (-?\d+(?:\.\d+)?)。用 (.+?) 表示并求 x。$/);
  if (match && compactMath(match[3]) === compactMath(`x ÷ ${match[1]} = ${match[2]}`)) {
    return { expression: match[3], unit: null };
  }

  match = stem.match(/^每盒彩笔 (-?\d+(?:\.\d+)?) 支，另有散装 (-?\d+(?:\.\d+)?) 支，共 (-?\d+(?:\.\d+)?) 支。列方程 (.+?)，求盒数 x。$/);
  if (match && compactMath(match[4]) === compactMath(`${match[1]}x + ${match[2]} = ${match[3]}`)) {
    return { expression: match[4], unit: "盒" };
  }

  match = stem.match(/^两种装盒方案数量相同：方案甲每组 (-?\d+(?:\.\d+)?) 盒并另加括号内的 (-?\d+(?:\.\d+)?) 盒，方案乙有 (-?\d+(?:\.\d+)?)x 盒再加 (-?\d+(?:\.\d+)?) 盒。根据 (.+?) 求 x。$/);
  if (match && compactMath(match[5]) === compactMath(`${match[1]}(x + ${match[2]}) = ${match[3]}x + ${match[4]}`)) {
    return { expression: match[5], unit: null };
  }

  return null;
}

type NumericRule = {
  pattern: RegExp;
  unit: string | null;
  calculate: (captures: string[]) => number;
};

function numericList(value: string): number[] {
  const values = value.split(/[、，,]/).map(Number);
  if (values.length === 0 || values.some((item) => !Number.isFinite(item))) {
    throw new Error("Invalid numeric list");
  }
  return values;
}

const numericRules: NumericRule[] = [
  {
    pattern: /^一个平角被分成两个角，其中一个是 (-?\d+(?:\.\d+)?) 度，另一个是多少度？$/,
    unit: "度",
    calculate: ([known]) => 180 - Number(known),
  },
  {
    pattern: /^长方形长 (-?\d+(?:\.\d+)?) 厘米，宽 (-?\d+(?:\.\d+)?) 厘米，周长是多少厘米？$/,
    unit: "厘米",
    calculate: ([length, width]) => 2 * (Number(length) + Number(width)),
  },
  {
    pattern: /^一个长方形周长 (-?\d+(?:\.\d+)?) 厘米，长 (-?\d+(?:\.\d+)?) 厘米，宽是多少厘米？$/,
    unit: "厘米",
    calculate: ([perimeter, length]) => Number(perimeter) / 2 - Number(length),
  },
  {
    pattern: /^长方形长 (-?\d+(?:\.\d+)?) 厘米，宽 (-?\d+(?:\.\d+)?) 厘米，面积是多少平方厘米？$/,
    unit: "平方厘米",
    calculate: ([length, width]) => Number(length) * Number(width),
  },
  {
    pattern: /^三角形底 (-?\d+(?:\.\d+)?) 厘米，高 (-?\d+(?:\.\d+)?) 厘米，面积是多少平方厘米？$/,
    unit: "平方厘米",
    calculate: ([base, height]) => Number(base) * Number(height) / 2,
  },
  {
    pattern: /^长方体长 (-?\d+(?:\.\d+)?) 厘米、宽 (-?\d+(?:\.\d+)?) 厘米、高 (-?\d+(?:\.\d+)?) 厘米，体积是多少立方厘米？$/,
    unit: "立方厘米",
    calculate: ([length, width, height]) => Number(length) * Number(width) * Number(height),
  },
  {
    pattern: /^一块 L 形纸板可看成 (-?\d+(?:\.\d+)?) 厘米 × (-?\d+(?:\.\d+)?) 厘米的长方形，挖去一个 (-?\d+(?:\.\d+)?) 厘米 × (-?\d+(?:\.\d+)?) 厘米的小长方形。剩余面积是多少平方厘米？$/,
    unit: "平方厘米",
    calculate: ([outerLength, outerWidth, cutLength, cutWidth]) => (
      Number(outerLength) * Number(outerWidth) - Number(cutLength) * Number(cutWidth)
    ),
  },
  {
    pattern: /^阅读记录：甲组 (-?\d+(?:\.\d+)?) 人上午参加、(-?\d+(?:\.\d+)?) 人下午参加；乙组 (-?\d+(?:\.\d+)?) 人上午参加、(-?\d+(?:\.\d+)?) 人下午参加。两组下午参加的总人数是多少人？$/,
    unit: "人",
    calculate: (captures) => Number(captures[1]) + Number(captures[3]),
  },
  {
    pattern: /^条形图文字记录显示：一班回收 (-?\d+(?:\.\d+)?) 千克，二班回收 (-?\d+(?:\.\d+)?) 千克，三班回收 (-?\d+(?:\.\d+)?) 千克。最多的班比最少的班多多少千克？$/,
    unit: "千克",
    calculate: (captures) => Math.max(...captures.map(Number)) - Math.min(...captures.map(Number)),
  },
  {
    pattern: /^折线记录中，周一为 (-?\d+(?:\.\d+)?) 页，周二为 (-?\d+(?:\.\d+)?) 页，周三为 (-?\d+(?:\.\d+)?) 页。周一到周三一共增加了多少页？$/,
    unit: "页",
    calculate: (captures) => Number(captures[2]) - Number(captures[0]),
  },
  {
    pattern: /^四次练习得分依次为 ([\d.]+(?:、[\d.]+){3}) 分，平均分是多少分？$/,
    unit: "分",
    calculate: ([scores]) => {
      const values = numericList(scores);
      return values.reduce((total, score) => total + score, 0) / values.length;
    },
  },
  {
    pattern: /^每本练习册 (-?\d+(?:\.\d+)?) 元，买 (-?\d+(?:\.\d+)?) 本一共需要多少元？$/,
    unit: "元",
    calculate: ([price, count]) => Number(price) * Number(count),
  },
  {
    pattern: /^商店甲每包 (-?\d+(?:\.\d+)?) 支笔，售价 (-?\d+(?:\.\d+)?) 元；商店乙每包 (-?\d+(?:\.\d+)?) 支，售价 (-?\d+(?:\.\d+)?) 元。各买到 (-?\d+(?:\.\d+)?) 支时，选择更省的方案可少付多少元？$/,
    unit: "元",
    calculate: ([aCount, aPrice, bCount, bPrice, target]) => Math.abs(
      Math.ceil(Number(target) / Number(aCount)) * Number(aPrice)
      - Math.ceil(Number(target) / Number(bCount)) * Number(bPrice),
    ),
  },
  {
    pattern: /^自行车每小时行 (-?\d+(?:\.\d+)?) 千米，连续骑 (-?\d+(?:\.\d+)?) 小时，行程是多少千米？$/,
    unit: "千米",
    calculate: ([speed, hours]) => Number(speed) * Number(hours),
  },
  {
    pattern: /^小车先以每小时 (-?\d+(?:\.\d+)?) 千米行 (-?\d+(?:\.\d+)?) 小时，休息 (-?\d+(?:\.\d+)?) 分钟后，再以每小时 (-?\d+(?:\.\d+)?) 千米行 (-?\d+(?:\.\d+)?) 小时。全程行驶多少千米？$/,
    unit: "千米",
    calculate: (captures) => (
      Number(captures[0]) * Number(captures[1]) + Number(captures[3]) * Number(captures[4])
    ),
  },
  {
    pattern: /^一台机器每分钟装 (-?\d+(?:\.\d+)?) 个零件，工作 (-?\d+(?:\.\d+)?) 分钟，一共装多少个？$/,
    unit: "个",
    calculate: ([rate, minutes]) => Number(rate) * Number(minutes),
  },
  {
    pattern: /^甲每分钟整理 (-?\d+(?:\.\d+)?) 本，乙每分钟整理 (-?\d+(?:\.\d+)?) 本。两人同时工作 (-?\d+(?:\.\d+)?) 分钟，桌上原有 (-?\d+(?:\.\d+)?) 本备用记录册不需整理。实际整理多少本？$/,
    unit: "本",
    calculate: ([firstRate, secondRate, minutes]) => (
      (Number(firstRate) + Number(secondRate)) * Number(minutes)
    ),
  },
  {
    pattern: /^红、蓝卡片数量比是 (-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)，共有 (-?\d+(?:\.\d+)?) 张。红卡片有多少张？$/,
    unit: "张",
    calculate: ([redPart, bluePart, total]) => (
      Number(total) * Number(redPart) / (Number(redPart) + Number(bluePart))
    ),
  },
  {
    pattern: /^甲、乙两杯果汁原有体积比 (-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)，总量 (-?\d+(?:\.\d+)?) 毫升。喝掉甲杯 (-?\d+(?:\.\d+)?) 毫升后，甲杯还剩多少毫升？$/,
    unit: "毫升",
    calculate: ([first, second, total, drink]) => (
      Number(total) * Number(first) / (Number(first) + Number(second)) - Number(drink)
    ),
  },
  {
    pattern: /^一件文具原价 (-?\d+(?:\.\d+)?) 元，按 (-?\d+(?:\.\d+)?)% 计算折后价，折后是多少元？$/,
    unit: "元",
    calculate: ([original, percent]) => Number(original) * Number(percent) / 100,
  },
  {
    pattern: /^水箱原有 (-?\d+(?:\.\d+)?) 升水，上午用去 (-?\d+(?:\.\d+)?)%，下午又用去原有总量的 (-?\d+(?:\.\d+)?)%。还剩多少升？$/,
    unit: "升",
    calculate: ([total, morning, afternoon]) => (
      Number(total) * (1 - (Number(morning) + Number(afternoon)) / 100)
    ),
  },
  {
    pattern: /^学校买来 (-?\d+(?:\.\d+)?) 箱纸，每箱 (-?\d+(?:\.\d+)?) 包。先给低年级 (-?\d+(?:\.\d+)?) 包，再把剩下的平均分给 (-?\d+(?:\.\d+)?) 个班，每班多少包？$/,
    unit: "包",
    calculate: ([boxes, perBox, first, classes]) => (
      (Number(boxes) * Number(perBox) - Number(first)) / Number(classes)
    ),
  },
  {
    pattern: /^一批书先借出总数的 ([\d./]+)，又归还 (-?\d+(?:\.\d+)?) 本，此时有 (-?\d+(?:\.\d+)?) 本。原来共有多少本？$/,
    unit: "本",
    calculate: ([fraction, returned, remaining]) => (
      (Number(remaining) - Number(returned)) / (1 - arithmeticValue(fraction))
    ),
  },
  {
    pattern: /^图书角有故事书 (-?\d+(?:\.\d+)?) 本、科普书 (-?\d+(?:\.\d+)?) 本，书架高 (-?\d+(?:\.\d+)?) 厘米。今天借出故事书 (-?\d+(?:\.\d+)?) 本。故事书还剩多少本？$/,
    unit: "本",
    calculate: (captures) => Number(captures[0]) - Number(captures[3]),
  },
  {
    pattern: /^研学队有 (-?\d+(?:\.\d+)?) 名学生和 (-?\d+(?:\.\d+)?) 名教师，大巴每辆坐 (-?\d+(?:\.\d+)?) 人，车程 (-?\d+(?:\.\d+)?) 分钟。至少需要多少辆大巴？$/,
    unit: "辆",
    calculate: ([students, teachers, capacity]) => (
      Math.ceil((Number(students) + Number(teachers)) / Number(capacity))
    ),
  },
  {
    pattern: /^步道前段长 (-?\d+(?:\.\d+)?) 米，后段长 (-?\d+(?:\.\d+)?) 厘米。全长是多少米？请写单位。$/,
    unit: "米",
    calculate: ([meters, centimeters]) => Number(meters) + Number(centimeters) / 100,
  },
  {
    pattern: /^绳子原长 (-?\d+(?:\.\d+)?) 米，剪去 (-?\d+(?:\.\d+)?) 厘米，还剩多少厘米？$/,
    unit: "厘米",
    calculate: ([meters, centimeters]) => Number(meters) * 100 - Number(centimeters),
  },
  {
    pattern: /^圆形纸片的半径是 (-?\d+(?:\.\d+)?) 厘米，直径是多少厘米？$/,
    unit: "厘米",
    calculate: ([r]) => 2 * Number(r),
  },
  {
    pattern: /^圆形水池的直径是 (-?\d+(?:\.\d+)?) 米，半径是多少米？$/,
    unit: "米",
    calculate: ([d]) => Number(d) / 2,
  },
  {
    pattern: /^圆形花坛的直径是 (-?\d+(?:\.\d+)?) 米（π 取 3.14），花坛的周长是多少米？$/,
    unit: "米",
    calculate: ([d]) => 3.14 * Number(d),
  },
  {
    pattern: /^圆形钟面的半径是 (-?\d+(?:\.\d+)?) 厘米（π 取 3.14），钟面的周长是多少厘米？$/,
    unit: "厘米",
    calculate: ([r]) => 2 * 3.14 * Number(r),
  },
  {
    pattern: /^圆形草坪的半径是 (-?\d+(?:\.\d+)?) 米（π 取 3.14），草坪的面积是多少平方米？$/,
    unit: "平方米",
    calculate: ([r]) => 3.14 * Number(r) ** 2,
  },
  {
    pattern: /^圆形铁片外半径是 (-?\d+(?:\.\d+)?) 米、内半径是 (-?\d+(?:\.\d+)?) 米（π 取 3.14），圆环的面积是多少平方米？$/,
    unit: "平方米",
    calculate: ([R, r]) => 3.14 * (Number(R) ** 2 - Number(r) ** 2),
  },
  {
    pattern: /^小丽从家出发，先向正东走 (-?\d+(?:\.\d+)?) 米，再向正北走 (-?\d+(?:\.\d+)?) 米到达公园。她一共走了多少米？$/,
    unit: "米",
    calculate: ([a, b]) => Number(a) + Number(b),
  },
  {
    pattern: /^研学路线的三段路分别长 (-?\d+(?:\.\d+)?) 米、(-?\d+(?:\.\d+)?) 米、(-?\d+(?:\.\d+)?) 米，路线全长多少米？$/,
    unit: "米",
    calculate: ([a, b, c]) => Number(a) + Number(b) + Number(c),
  },
  {
    pattern: /^全校共有 (-?\d+(?:\.\d+)?) 名学生，喜欢阅读的占 (-?\d+(?:\.\d+)?)%，喜欢阅读的有多少人？$/,
    unit: "人",
    calculate: ([n, p]) => Number(n) * Number(p) / 100,
  },
  {
    pattern: /^班级图书角共有 (-?\d+(?:\.\d+)?) 本书，其中故事书占 (-?\d+(?:\.\d+)?)%，故事书有多少本？$/,
    unit: "本",
    calculate: ([n, p]) => Number(n) * Number(p) / 100,
  },
  {
    pattern: /^扇形统计图片段显示，喜欢足球的有 (-?\d+(?:\.\d+)?) 人，占调查总人数的 (-?\d+(?:\.\d+)?)%，调查总人数是多少人？$/,
    unit: "人",
    calculate: ([a, p]) => Number(a) * 100 / Number(p),
  },
  {
    pattern: /^全年级 (-?\d+(?:\.\d+)?) 人中，喜欢篮球的占 (-?\d+(?:\.\d+)?)%，喜欢羽毛球的占 (-?\d+(?:\.\d+)?)%，两类人数相差多少人？$/,
    unit: "人",
    calculate: ([n, p1, p2]) => Number(n) * Math.abs(Number(p1) - Number(p2)) / 100,
  },
  {
    pattern: /^家庭月支出为 (-?\d+(?:\.\d+)?) 元，扇形图中餐饮支出占 (-?\d+(?:\.\d+)?)%，餐饮支出是多少元？$/,
    unit: "元",
    calculate: ([n, p]) => Number(n) * Number(p) / 100,
  },
  {
    pattern: /^从 1 开始的连续奇数相加：1\+3\+\.\.\.\+(-?\d+(?:\.\d+)?)，共有 (-?\d+(?:\.\d+)?) 个奇数相加，和是多少？$/,
    unit: null,
    calculate: ([last, n]) => Number(n) ** 2,
  },
  {
    pattern: /^正方形点阵每边有 (-?\d+(?:\.\d+)?) 个点，点阵中一共有多少个点？$/,
    unit: null,
    calculate: ([n]) => Number(n) ** 2,
  },
  {
    pattern: /^三角形点阵第 (-?\d+(?:\.\d+)?) 个图形的最下面一层有 (-?\d+(?:\.\d+)?) 个点，点阵点数一共是多少？$/,
    unit: null,
    calculate: ([n]) => Number(n) * (Number(n) + 1) / 2,
  },
  {
    pattern: /^按图形不断等分：1\/2\+1\/4\+\.\.\.\+1\/(-?\d+(?:\.\d+)?)（最后一个分母是 2 的幂），把结果写成小数。$/,
    unit: null,
    calculate: ([denom]) => 1 - 1 / Number(denom),
  },
  {
    pattern: /^第 (-?\d+(?:\.\d+)?) 个大正方形由每层折 L 形小正方形拼成（第 1 层 1 个、第 2 层 3 个……），到第 (-?\d+(?:\.\d+)?) 层一共用了多少个小正方形？$/,
    unit: null,
    calculate: ([_, n]) => Number(n) ** 2,
  },
  {
    pattern: /^果园里梨树有 (-?\d+(?:\.\d+)?) 棵，占果树总棵数的 ([\d./]+)，果园共有果树多少棵？$/,
    unit: "棵",
    calculate: ([a, fraction]) => Number(a) / arithmeticValue(fraction),
  },
  {
    pattern: /^果园共有果树 (-?\d+(?:\.\d+)?) 棵，其中梨树占 ([\d./]+)，梨树有多少棵？$/,
    unit: "棵",
    calculate: ([n, fraction]) => Number(n) * arithmeticValue(fraction),
  },
  {
    pattern: /^把 (-?\d+(?:\.\d+)?) 化成百分数，结果是百分之多少？$/, unit: null,
    calculate: ([d]) => Number(d) * 100,
  },
  {
    pattern: /^把 (-?\d+(?:\.\d+)?)% 化成小数，结果是多少？$/, unit: null,
    calculate: ([p]) => Number(p) / 100,
  },
  {
    pattern: /^抽检 (-?\d+(?:\.\d+)?) 个零件，其中 (-?\d+(?:\.\d+)?) 个合格，合格率是百分之多少？$/, unit: null,
    calculate: ([total, qualified]) => Number(qualified) / Number(total) * 100,
  },
  {
    pattern: /^班级应到 (-?\d+(?:\.\d+)?) 人，实到 (-?\d+(?:\.\d+)?) 人，出勤率是百分之多少？$/, unit: null,
    calculate: ([total, present]) => Number(present) / Number(total) * 100,
  },
  {
    pattern: /^(-?\d+(?:\.\d+)?) 的 (-?\d+(?:\.\d+)?)% 是多少？$/, unit: null,
    calculate: ([n, p]) => Number(n) * Number(p) / 100,
  },
  {
    pattern: /^一件商品原价 (-?\d+(?:\.\d+)?) 元，商店打 (-?\d+(?:\.\d+)?) 折出售，现价是多少元？$/, unit: "元",
    calculate: ([n, zhe]) => Number(n) * Number(zhe) / 10,
  },
  {
    pattern: /^去年产量 (-?\d+(?:\.\d+)?) 吨，今年比去年增产 (-?\d+(?:\.\d+)?) 成，今年产量是多少吨？$/, unit: "吨",
    calculate: ([n, cheng]) => Number(n) * (1 + Number(cheng) / 10),
  },
  {
    pattern: /^商店五月份营业额为 (-?\d+(?:\.\d+)?) 元，按营业额的 (-?\d+(?:\.\d+)?)% 缴纳增值税，应纳税额是多少元？$/, unit: "元",
    calculate: ([n, p]) => Number(n) * Number(p) / 100,
  },
  {
    pattern: /^小明把 (-?\d+(?:\.\d+)?) 元压岁钱存入银行，年利率是 (-?\d+(?:\.\d+)?)%，存期 (-?\d+(?:\.\d+)?) 年，到期利息是多少元？$/, unit: "元",
    calculate: ([n, p, t]) => Number(n) * Number(p) / 100 * Number(t),
  },
  {
    pattern: /^本金 (-?\d+(?:\.\d+)?) 元，年利率 (-?\d+(?:\.\d+)?)%，存 (-?\d+(?:\.\d+)?) 年后，本金和利息一共是多少元？$/, unit: "元",
    calculate: ([n, p, t]) => Number(n) + Number(n) * Number(p) / 100 * Number(t),
  },
  {
    pattern: /^甲地气温是 (-?\d+(?:\.\d+)?) ℃，乙地气温是 (-?\d+(?:\.\d+)?) ℃，两地气温相差多少摄氏度？$/,
    unit: "摄氏度",
    calculate: ([a, b]) => Math.abs(Number(a) - Number(b)),
  },
  {
    pattern: /^数轴上点 A 表示 (-?\d+(?:\.\d+)?)，点 B 表示 (-?\d+(?:\.\d+)?)，A、B 两点相距多少？$/,
    unit: null,
    calculate: ([a, b]) => Math.abs(Number(a) - Number(b)),
  },
  {
    pattern: /^珠穆朗玛峰海拔约 (-?\d+(?:\.\d+)?) 米，吐鲁番盆地海拔约 (-?\d+(?:\.\d+)?) 米，两地海拔相差多少米？$/,
    unit: "米",
    calculate: ([a, b]) => Number(a) - Number(b),
  },
  {
    pattern: /^在 (-?\d+(?:\.\d+)?(?:、-?\d+(?:\.\d+)?){2,}) 这些数中，负数有多少个？$/,
    unit: null,
    calculate: ([list]) => list.split("、").filter((v) => Number(v) < 0).length,
  },
  {
    pattern: /^小明的微信钱包原有 (-?\d+(?:\.\d+)?) 元，收到红包 (-?\d+(?:\.\d+)?) 元后又购物支出 (-?\d+(?:\.\d+)?) 元，余额变化记作多少元？$/,
    unit: "元",
    calculate: ([a, b, c]) => Number(b) - Number(c),
  },
  {
    pattern: /^圆柱底面周长是 (-?\d+(?:\.\d+)?) 厘米，高是 (-?\d+(?:\.\d+)?) 厘米，它的侧面积是多少平方厘米？$/,
    unit: "平方厘米",
    calculate: ([c, h]) => Number(c) * Number(h),
  },
  {
    pattern: /^圆柱底面直径是 (-?\d+(?:\.\d+)?) 厘米，高是 (-?\d+(?:\.\d+)?) 厘米（π 取 3.14），它的侧面积是多少平方厘米？$/,
    unit: "平方厘米",
    calculate: ([d, h]) => 3.14 * Number(d) * Number(h),
  },
  {
    pattern: /^圆柱底面半径是 (-?\d+(?:\.\d+)?) 厘米，高是 (-?\d+(?:\.\d+)?) 厘米（π 取 3.14），它的表面积是多少平方厘米？$/,
    unit: "平方厘米",
    calculate: ([r, h]) => 2 * 3.14 * Number(r) * Number(h) + 2 * 3.14 * Number(r) ** 2,
  },
  {
    pattern: /^圆柱的底面积是 (-?\d+(?:\.\d+)?) 平方厘米，高是 (-?\d+(?:\.\d+)?) 厘米，它的体积是多少立方厘米？$/,
    unit: "立方厘米",
    calculate: ([s, h]) => Number(s) * Number(h),
  },
  {
    pattern: /^圆柱底面半径是 (-?\d+(?:\.\d+)?) 厘米，高是 (-?\d+(?:\.\d+)?) 厘米（π 取 3.14），它的体积是多少立方厘米？$/,
    unit: "立方厘米",
    calculate: ([r, h]) => 3.14 * Number(r) ** 2 * Number(h),
  },
  {
    pattern: /^圆锥的底面积是 (-?\d+(?:\.\d+)?) 平方厘米，高是 (-?\d+(?:\.\d+)?) 厘米，它的体积是多少立方厘米？$/,
    unit: "立方厘米",
    calculate: ([s, h]) => Number(s) * Number(h) / 3,
  },
  {
    pattern: /^圆锥底面半径是 (-?\d+(?:\.\d+)?) 厘米，高是 (-?\d+(?:\.\d+)?) 厘米（π 取 3.14），它的体积是多少立方厘米？$/,
    unit: "立方厘米",
    calculate: ([r, h]) => 3.14 * Number(r) ** 2 * Number(h) / 3,
  },
  {
    pattern: /^解比例 x：(-?\d+(?:\.\d+)?) = (-?\d+(?:\.\d+)?)：(-?\d+(?:\.\d+)?)，x 等于多少？$/,
    unit: null,
    calculate: ([a, b, c]) => Number(a) * Number(b) / Number(c),
  },
  {
    pattern: /^解比例 (-?\d+(?:\.\d+)?)：x = (-?\d+(?:\.\d+)?)：(-?\d+(?:\.\d+)?)，x 等于多少？$/,
    unit: null,
    calculate: ([a, b, c]) => Number(a) * Number(c) / Number(b),
  },
  {
    pattern: /^图上 (-?\d+(?:\.\d+)?) 厘米表示实际 (-?\d+(?:\.\d+)?) 千米，这幅图的比例尺是 1 比多少？$/,
    unit: null,
    calculate: ([cm, km]) => Number(km) * 100000 / Number(cm),
  },
  {
    pattern: /^一幅地图的比例尺是 1：(-?\d+(?:\.\d+)?)，量得图上距离是 (-?\d+(?:\.\d+)?) 厘米，实际距离是多少千米？$/,
    unit: "千米",
    calculate: ([n, cm]) => Number(n) * Number(cm) / 100000,
  },
  {
    pattern: /^一幅地图的比例尺是 1：(-?\d+(?:\.\d+)?)，实际距离是 (-?\d+(?:\.\d+)?) 千米，图上距离是多少厘米？$/,
    unit: "厘米",
    calculate: ([n, km]) => Number(km) * 100000 / Number(n),
  },
  {
    pattern: /^把 (-?\d+(?:\.\d+)?) 个苹果放进 (-?\d+(?:\.\d+)?) 个抽屉，总有一个抽屉里至少放多少个苹果？$/,
    unit: "个",
    calculate: ([n, k]) => Math.ceil(Number(n) / Number(k)),
  },
  {
    pattern: /^(-?\d+(?:\.\d+)?) 只鸽子飞回 (-?\d+(?:\.\d+)?) 个鸽巢，总有一个鸽巢至少飞回多少只鸽子？$/,
    unit: "只",
    calculate: ([n, k]) => Math.ceil(Number(n) / Number(k)),
  },
  {
    pattern: /^(-?\d+(?:\.\d+)?) 名学生中，至少有多少名学生的生日在同一个月份？$/,
    unit: "名",
    calculate: ([n]) => Math.ceil(Number(n) / 12),
  },
  {
    pattern: /^盒子里有 (-?\d+(?:\.\d+)?) 种不同颜色的球，至少摸出多少个球，才能保证摸出的球中有 2 个同色？$/,
    unit: "个",
    calculate: ([colors]) => Number(colors) + 1,
  },
  {
    pattern: /^一副扑克牌去掉大小王后还有 4 种花色，至少抽出多少张牌，才能保证抽出的牌中有 (-?\d+(?:\.\d+)?) 张同一花色？$/,
    unit: "张",
    calculate: ([m]) => 4 * (Number(m) - 1) + 1,
  },
  {
    pattern: /^把 (-?\d+(?:\.\d+)?) 本书分给 (-?\d+(?:\.\d+)?) 个班，总有一个班至少分到多少本书？$/,
    unit: "本",
    calculate: ([n, k]) => Math.ceil(Number(n) / Number(k)),
  },
  {
    pattern: /^一项工程，甲队单独做 (-?\d+(?:\.\d+)?) 天完成，乙队单独做 (-?\d+(?:\.\d+)?) 天完成。两队合作，多少天可以完成？$/,
    unit: "天",
    calculate: ([a, b]) => Number(a) * Number(b) / (Number(a) + Number(b)),
  },
  {
    pattern: /^一项工程，甲队单独做 (-?\d+(?:\.\d+)?) 天完成，乙队单独做 (-?\d+(?:\.\d+)?) 天完成。两队合作 (-?\d+(?:\.\d+)?) 天完成了这项工程的多少（把结果写成小数）？$/,
    unit: null,
    calculate: ([a, b, t]) => Number(t) * (1 / Number(a) + 1 / Number(b)),
  },
  {
    pattern: /^一个水池单开进水管 (-?\d+(?:\.\d+)?) 小时可将空池注满，单开出水管 (-?\d+(?:\.\d+)?) 小时可将满池水排空。两管同时打开，多少小时能把空池注满？$/,
    unit: "小时",
    calculate: ([a, b]) => 1 / (1 / Number(a) - 1 / Number(b)),
  },
  {
    pattern: /^用一根长 (-?\d+(?:\.\d+)?) 厘米的铁丝围成一个三角形，三条边的长度比是 (-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)，最短的一条边长多少厘米？$/,
    unit: "厘米",
    calculate: ([total, p1, p2, p3]) => {
      const parts = [Number(p1), Number(p2), Number(p3)];
      return Number(total) * Math.min(...parts) / parts.reduce((s, v) => s + v, 0);
    },
  },
  {
    pattern: /^甲、乙两个数的比是 (-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?)，甲数比乙数大 (-?\d+(?:\.\d+)?)，甲数是多少？$/,
    unit: null,
    calculate: ([a, b, diff]) => Number(diff) * Number(a) / (Number(a) - Number(b)),
  },
  {
    pattern: /^学校把一批图书按 (-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?):(-?\d+(?:\.\d+)?) 分给四、五、六年级，五年级分到 (-?\d+(?:\.\d+)?) 本，这批图书共有多少本？$/,
    unit: "本",
    calculate: ([p1, p2, p3, known]) => (
      Number(known) * (Number(p1) + Number(p2) + Number(p3)) / Number(p2)
    ),
  },
  {
    pattern: /^把带分数 ((?:\d+)又(?:\d+)\/(?:\d+)) 化成小数。$/,
    unit: null,
    calculate: ([mixed]) => {
      const match = mixed.match(/^(\d+)又(\d+)\/(\d+)$/);
      if (!match) throw new Error("Invalid mixed number");
      return Number(match[1]) + Number(match[2]) / Number(match[3]);
    },
  },
  {
    pattern: /^把 (-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?) 化成最简分数后，分子是多少？$/,
    unit: null,
    calculate: ([numerator, denominator]) => {
      let a = Math.abs(Number(numerator));
      let b = Math.abs(Number(denominator));
      while (b !== 0) [a, b] = [b, a % b];
      return Number(numerator) / a;
    },
  },
  // P2-9 decimal 拆分：四下小数加减情境。
  {
    pattern: /^一条彩带长 (-?\d+(?:\.\d+)?) 米，用去 (-?\d+(?:\.\d+)?) 米，还剩多少米？$/,
    unit: "米",
    calculate: ([total, used]) => Number(total) - Number(used),
  },
  {
    pattern: /^一支钢笔 (-?\d+(?:\.\d+)?) 元，一块橡皮 (-?\d+(?:\.\d+)?) 元，各买一件一共要付多少元？$/,
    unit: "元",
    calculate: ([pen, eraser]) => Number(pen) + Number(eraser),
  },
  // P2-9 decimal-ops：五上小数乘除。
  {
    pattern: /^一块长方形玻璃长 (-?\d+(?:\.\d+)?) 米，宽 (-?\d+(?:\.\d+)?) 米，它的面积是多少平方米？$/,
    unit: "平方米",
    calculate: ([length, width]) => Number(length) * Number(width),
  },
  {
    pattern: /^(-?\d+(?:\.\d+)?) × (-?\d+(?:\.\d+)?) 的积保留一位小数，约是多少？$/,
    unit: null,
    calculate: ([left, right]) => Math.round(Number(left) * Number(right) * 10) / 10,
  },
  {
    pattern: /^把 (-?\d+(?:\.\d+)?) 升果汁平均分给 (-?\d+(?:\.\d+)?) 个小朋友，每人分得多少升？$/,
    unit: "升",
    calculate: ([juice, children]) => Number(juice) / Number(children),
  },
  // P2-10a mixed-operations：购物找零情境，三个捕获都是直接参与计算的数
  // （数量、单价、付款），故显式钉死数字形态，不使用 (.+?)。
  {
    pattern: /^妈妈买 (\d+(?:\.\d+)?) 千克苹果，每千克 (\d+(?:\.\d+)?) 元，付出 (\d+(?:\.\d+)?) 元，应找回多少元？$/,
    unit: "元",
    calculate: ([count, price, paid]) => Number(paid) - Number(count) * Number(price),
  },
  // P2-10b price-model：求单价，整盒总价 ÷ 本数。物品名经 surfaceVariants 归一，
  // 两个数字捕获均为正整数且全部参与计算。
  {
    pattern: /^笔记本一盒有 (\d+) 本，整盒售价 (\d+) 元。每本多少元？$/,
    unit: "元",
    calculate: ([count, total]) => Number(total) / Number(count),
  },
  // P2-10b price-model：两种文具各买若干，四个捕获（单价、数量各两组）全部参与求和。
  {
    pattern: /^圆珠笔每支 (\d+) 元，买 (\d+) 支；笔记本每本 (\d+) 元，买 (\d+) 本。一共要付多少元？$/,
    unit: "元",
    calculate: ([penPrice, penCount, bookPrice, bookCount]) => (
      Number(penPrice) * Number(penCount) + Number(bookPrice) * Number(bookCount)
    ),
  },
  // P2-10b distance-model：求时间，路程 ÷ 速度。
  {
    pattern: /^客车行驶 (\d+) 千米，每小时行 (\d+) 千米，需要多少小时？$/,
    unit: "小时",
    calculate: ([distance, speed]) => Number(distance) / Number(speed),
  },
  // P2-10b distance-model：求速度，路程 ÷ 时间（捕获顺序为时间、路程）。
  {
    pattern: /^大巴 (\d+) 小时行驶 (\d+) 千米，每小时行多少千米？$/,
    unit: "千米",
    calculate: ([hours, distance]) => Number(distance) / Number(hours),
  },
  // P2-10b distance-model：往返问题，去程速度×时间求路程，再 ÷ 返回速度求返回时间。
  {
    pattern: /^小车从甲地到乙地，去时每小时行 (\d+) 千米，行了 (\d+) 小时；原路返回时每小时行 (\d+) 千米，返回需要多少小时？$/,
    unit: "小时",
    calculate: ([goSpeed, goHours, backSpeed]) => (
      Number(goSpeed) * Number(goHours) / Number(backSpeed)
    ),
  },
  // P2-10c angle：直角被分成两角，90 - 已知角。捕获为正度数且唯一参与计算。
  {
    pattern: /^一个直角被分成两个角，其中一个角是 (\d+(?:\.\d+)?) 度，另一个是多少度？$/,
    unit: "度",
    calculate: ([known]) => 90 - Number(known),
  },
  // P2-10c angle：两个三角尺角顶点重合拼一起，拼成角 = 两角之和。捕获显式钉死
  // 为三角尺角度集合 30/45/60/90，同句式的非三角尺角度不予锚定。
  {
    pattern: /^把三角尺上 (30|45|60|90) 度的角和 (30|45|60|90) 度的角顶点重合拼在一起，拼成的角是多少度？$/,
    unit: "度",
    calculate: ([first, second]) => Number(first) + Number(second),
  },
  // P2-10c angle：整时钟面两针较小夹角。捕获钉死为 1-11 的整时数，取与 12 的
  // 较小间隔大格数 × 30。
  {
    pattern: /^钟面上时针指向 (1[01]|[1-9])、分针指向 12，这时两针之间较小的夹角是多少度？$/,
    unit: "度",
    calculate: ([hourText]) => {
      const hour = Number(hourText);
      return Math.min(hour, 12 - hour) * 30;
    },
  },
  // P2-10c spatial：分层数小正方体，底层每排个数×排数+上层个数。三个正整数
  // 捕获全部参与计算。
  {
    pattern: /^用相同小正方体摆成两层：底层每排 (\d+) 个、摆 (\d+) 排，上层摆 (\d+) 个。一共用了多少个小正方体？$/,
    unit: "个",
    calculate: ([length, width, upper]) => (
      Number(length) * Number(width) + Number(upper)
    ),
  },
];

function numberProof(stem: string): NumberProof | null {
  let match = stem.match(/^口算[：:]\s*(.+?)\s*=\s*[？?]$/);
  if (match) return { value: arithmeticValue(match[1]), unit: null };

  match = stem.match(/^计算\s+(.+?)(?:，把结果写成小数)?[。.]$/);
  if (match) return { value: arithmeticValue(match[1]), unit: null };

  match = stem.match(/^用简便方法计算\s+(.+?)[。.]$/);
  if (match) return { value: arithmeticValue(match[1]), unit: null };

  match = stem.match(/^选择合适的运算律计算\s+(.+?)[。.]$/);
  if (match) return { value: arithmeticValue(match[1]), unit: null };

  // P2-10a operation-law：两条简算引导语形态固定，括号内表达式经 arithmeticValue
  // 严格求值（含括号与四则），故捕获 (.+?) 不会放过非法算式。
  match = stem.match(/^用减法的性质简算[：:]\s*(.+?)[。.]$/);
  if (match) return { value: arithmeticValue(match[1]), unit: null };

  match = stem.match(/^用乘法分配律简算\s+(.+?)[。.]$/);
  if (match) return { value: arithmeticValue(match[1]), unit: null };

  match = stem.match(/^求\s+(-?\d+(?:\.\d+)?)\s+的\s+(.+?)\s+是多少[。.]$/);
  if (match) return { value: Number(match[1]) * arithmeticValue(match[2]), unit: null };

  for (const rule of numericRules) {
    match = stem.match(rule.pattern);
    if (!match) continue;
    const value = rule.calculate(match.slice(1));
    if (!Number.isFinite(value)) throw new Error("Non-finite numeric proof");
    return { value, unit: rule.unit };
  }

  return null;
}

function choiceOptions(stem: string): ChoiceOption[] {
  return [...stem.matchAll(/([ABCD])[.．、]\s*([\s\S]*?)(?=\s+[ABCD][.．、]\s*|$)/g)]
    .map((match) => ({
      label: match[1] as ChoiceOption["label"],
      text: match[2].trim().replace(/[。；;]$/, ""),
    }));
}

function choiceQuestion(stem: string): string | null {
  const firstOption = stem.search(/A[.．、]\s*/);
  return firstOption < 0 ? null : stem.slice(0, firstOption).trim();
}

function compactText(value: string): string {
  return value.replace(/\s+/g, "");
}

function optionsEqualTo(options: ChoiceOption[], expected: string): ChoiceOption[] {
  const normalized = compactText(expected);
  return options.filter(({ text }) => compactText(text) === normalized);
}

function closestNumericOptions(options: ChoiceOption[], expected: number): ChoiceOption[] {
  const distances = options.map(({ text }) => Math.abs(Number(text) - expected));
  if (distances.some((distance) => !Number.isFinite(distance))) throw new Error("Non-numeric option");
  const closest = Math.min(...distances);
  return options.filter((_, index) => Math.abs(distances[index] - closest) <= 1e-8);
}

function rangeContains(range: string, value: number): boolean {
  const normalized = compactText(range);
  const interval = normalized.match(/^(-?\d+(?:\.\d+)?)到(-?\d+(?:\.\d+)?)$/);
  if (interval) return value >= Number(interval[1]) && value <= Number(interval[2]);
  const below = normalized.match(/^小于(-?\d+(?:\.\d+)?)$/);
  if (below) return value < Number(below[1]);
  const above = normalized.match(/^大于(-?\d+(?:\.\d+)?)$/);
  if (above) return value > Number(above[1]);
  throw new Error("Unsupported range");
}

type BinaryOperator = "+" | "-" | "*" | "/";
type BinaryOperation = { left: number; operator: BinaryOperator; right: number };
type CheckEquation = { operation: BinaryOperation; result: number };

function sameNumber(left: number, right: number): boolean {
  return Math.abs(left - right) <= 1e-8;
}

function parseNumber(expression: string): number | null {
  const normalized = compactMath(expression);
  return /^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized) ? Number(normalized) : null;
}

function parseBinaryOperation(expression: string): BinaryOperation | null {
  const match = compactMath(expression).match(
    /^(-?(?:\d+(?:\.\d+)?|\.\d+))([+\-*/])(-?(?:\d+(?:\.\d+)?|\.\d+))$/,
  );
  return match ? {
    left: Number(match[1]),
    operator: match[2] as BinaryOperator,
    right: Number(match[3]),
  } : null;
}

function evaluateBinary(operation: BinaryOperation): number {
  if (operation.operator === "+") return operation.left + operation.right;
  if (operation.operator === "-") return operation.left - operation.right;
  if (operation.operator === "*") return operation.left * operation.right;
  return operation.left / operation.right;
}

function parseCheckEquation(statement: string): CheckEquation | null {
  const sides = compactMath(statement.replace("是否等于", "=")).split("=");
  if (sides.length !== 2) return null;
  const leftOperation = parseBinaryOperation(sides[0]);
  const rightOperation = parseBinaryOperation(sides[1]);
  const leftNumber = parseNumber(sides[0]);
  const rightNumber = parseNumber(sides[1]);
  if (leftOperation && rightNumber !== null && !rightOperation) {
    return { operation: leftOperation, result: rightNumber };
  }
  if (rightOperation && leftNumber !== null && !leftOperation) {
    return { operation: rightOperation, result: leftNumber };
  }
  return null;
}

function inverseChecks(original: BinaryOperation, claim: number): CheckEquation[] {
  if (original.operator === "+") return [
    { operation: { left: claim, operator: "-", right: original.right }, result: original.left },
    { operation: { left: claim, operator: "-", right: original.left }, result: original.right },
  ];
  if (original.operator === "-") return [
    { operation: { left: claim, operator: "+", right: original.right }, result: original.left },
    { operation: { left: original.left, operator: "-", right: claim }, result: original.right },
  ];
  if (original.operator === "*") return [
    { operation: { left: claim, operator: "/", right: original.right }, result: original.left },
    { operation: { left: claim, operator: "/", right: original.left }, result: original.right },
  ];
  return [
    { operation: { left: claim, operator: "*", right: original.right }, result: original.left },
    { operation: { left: original.left, operator: "/", right: claim }, result: original.right },
  ];
}

function sameOperation(left: BinaryOperation, right: BinaryOperation): boolean {
  return left.operator === right.operator
    && sameNumber(left.left, right.left)
    && sameNumber(left.right, right.right);
}

function sameCheck(left: CheckEquation, right: CheckEquation): boolean {
  return sameOperation(left.operation, right.operation) && sameNumber(left.result, right.result);
}

function relatedInverseExpression(originalText: string, claim: number, candidateText: string): boolean {
  const original = parseBinaryOperation(originalText);
  const candidate = parseBinaryOperation(candidateText);
  if (!original || !candidate) return false;
  const candidateCheck = { operation: candidate, result: evaluateBinary(candidate) };
  return inverseChecks(original, claim).some((expected) => sameCheck(expected, candidateCheck));
}

function relatedInverseCheck(originalText: string, claim: number, statement: string): boolean {
  const original = parseBinaryOperation(originalText);
  const evidence = parseCheckEquation(statement);
  return Boolean(original && evidence
    && inverseChecks(original, claim).some((expected) => sameCheck(expected, evidence)));
}

function checkIsTrue(evidence: CheckEquation): boolean {
  return Number.isFinite(evidence.result)
    && sameNumber(evaluateBinary(evidence.operation), evidence.result);
}

function renderedChoiceProof(stem: string, options: ChoiceOption[]): ChoiceOption[] | null {
  const question = choiceQuestion(stem);
  if (!question) return null;
  let match: RegExpMatchArray | null;

  match = question.match(/^计算\s+([0-9.()（）+\-*/×÷\s]+)[。.]$/);
  if (match) {
    const expected = arithmeticValue(match[1]);
    return options.filter(({ text }) => Math.abs(Number(text) - expected) <= 1e-8);
  }

  match = question.match(/^不做精确计算，(.+) 的结果最接近哪一个？$/);
  if (match) return closestNumericOptions(options, arithmeticValue(match[1]));

  match = question.match(/^小宁估算 (.+) 时说结果约为 (-?\d+(?:\.\d+)?)。结合数量级判断，哪项说明最合理？$/);
  if (match) {
    const exact = arithmeticValue(match[1]);
    const claim = Number(match[2]);
    const relativeDifference = Math.abs(claim - exact) / Math.max(Math.abs(exact), 1);
    return optionsEqualTo(
      options,
      relativeDifference <= 0.1 ? "估算合理" : claim > exact ? "一定偏大" : "一定偏小",
    );
  }

  match = question.match(/^算式 (.+) 的结果是 (-?\d+(?:\.\d+)?)。下面哪一个算式能直接检查这个结果？$/);
  if (match) {
    const original = match[1];
    const claim = Number(match[2]);
    return options.filter(({ text }) => relatedInverseExpression(original, claim, text));
  }

  match = question.match(/^同学计算 (.+) 得到 (-?\d+(?:\.\d+)?)，又用 (.+) 检查。根据两条信息，最合理的判断是：$/);
  if (match) {
    const exact = arithmeticValue(match[1]);
    const claim = Number(match[2]);
    const check = match[3].replace("是否等于", "=");
    const related = relatedInverseCheck(match[1], claim, check);
    const evidence = parseCheckEquation(check);
    const expected = !related
      ? "检查式与原式无关"
      : sameNumber(exact, claim) && evidence && checkIsTrue(evidence)
        ? "原计算一定正确"
        : "检查发现原结果有误";
    return optionsEqualTo(options, expected);
  }

  match = question.match(/^方程 x \+ (-?\d+(?:\.\d+)?) = (-?\d+(?:\.\d+)?) 的第一步应怎样做？$/);
  if (match) return optionsEqualTo(options, `两边减 ${match[1]}`);

  match = question.match(/^盒中原有 x 枚棋子，又放入 (-?\d+(?:\.\d+)?) 枚后共有 (-?\d+(?:\.\d+)?) 枚。哪一个方程正确？$/);
  if (match) return optionsEqualTo(options, `x + ${match[1]} = ${match[2]}`);

  match = question.match(/^解 x - (-?\d+(?:\.\d+)?) = (-?\d+(?:\.\d+)?) 时，小禾写成 x = (-?\d+(?:\.\d+)?) - (-?\d+(?:\.\d+)?)。应如何判断？$/);
  if (match) {
    if (match[2] !== match[3] || match[1] !== match[4]) return [];
    return optionsEqualTo(options, "应把两数相加");
  }

  match = question.match(/^方程 (-?\d+(?:\.\d+)?)x = (-?\d+(?:\.\d+)?) 中，下一步应写成：$/);
  if (match) {
    const expected = Number(match[2]) / Number(match[1]);
    return options.filter(({ text }) => {
      const right = text.match(/^x\s*=\s*(.+)$/)?.[1];
      if (!right) return false;
      try {
        return Math.abs(arithmeticValue(right) - expected) <= 1e-8;
      } catch {
        return false;
      }
    });
  }

  match = question.match(/^解 (-?\d+(?:\.\d+)?)x \+ (-?\d+(?:\.\d+)?) = (-?\d+(?:\.\d+)?) 时，哪组步骤保持等式平衡？$/);
  if (match) return optionsEqualTo(options, `先两边减 ${match[2]}，再两边除以 ${match[1]}`);

  match = question.match(/^方程 (-?\d+(?:\.\d+)?)\(x - (-?\d+(?:\.\d+)?)\) = (-?\d+(?:\.\d+)?) 展开后应是：$/);
  if (match) return optionsEqualTo(options, `${match[1]}x - ${Number(match[1]) * Number(match[2])} = ${match[3]}`);

  match = question.match(/^检查方程 (-?\d+(?:\.\d+)?)x \+ (-?\d+(?:\.\d+)?) = (-?\d+(?:\.\d+)?)x \+ (-?\d+(?:\.\d+)?) 的解 x = (-?\d+(?:\.\d+)?)，应优先做什么？$/);
  if (match) return optionsEqualTo(options, `把 ${match[5]} 分别代入等号两边`);

  match = question.match(/^用 (-?\d+(?:\.\d+)?) 个相同小正方体排成一列，再在从左数第 (-?\d+(?:\.\d+)?) 个上方叠 1 个。从正面看，各列高度最合理的是：$/);
  if (match) {
    const count = Number(match[1]);
    const position = Number(match[2]);
    if (!Number.isInteger(count) || !Number.isInteger(position) || position < 1 || position > count) return [];
    const heights = Array.from({ length: count }, () => 1);
    heights[position - 1] = 2;
    return optionsEqualTo(options, heights.join(","));
  }

  match = question.match(/^甲组数据是 ([\d.]+(?:、[\d.]+)+)，乙组数据是 ([\d.]+(?:、[\d.]+)+)。要求“平均数更大且波动更小”，哪组符合？$/);
  if (match) {
    const first = numericList(match[1]);
    const second = numericList(match[2]);
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
    const firstMatches = mean(first) > mean(second) && spread(first) < spread(second);
    const secondMatches = mean(second) > mean(first) && spread(second) < spread(first);
    return optionsEqualTo(options, firstMatches ? "甲组" : secondMatches ? "乙组" : "信息不足");
  }

  match = question.match(/^袋中有 (-?\d+(?:\.\d+)?) 个红球、(-?\d+(?:\.\d+)?) 个蓝球和 (-?\d+(?:\.\d+)?) 个绿球。任取一个，哪种颜色最可能出现？$/);
  if (match) {
    const counts = match.slice(1).map(Number);
    const maximum = Math.max(...counts);
    const maxima = counts.flatMap((count, index) => count === maximum ? [index] : []);
    if (maxima.length !== 1 && maxima.length !== 3) return [];
    return optionsEqualTo(options, maxima.length === 3 ? "三种一样" : ["红", "蓝", "绿"][maxima[0]]);
  }

  match = question.match(/^题目说“每盒彩笔 (-?\d+(?:\.\d+)?) 支，买了 (-?\d+(?:\.\d+)?) 盒，还送了 (-?\d+(?:\.\d+)?) 支”。问题是“一共有多少支”。真正要求的是：$/);
  if (match) return optionsEqualTo(options, "总支数");

  match = question.match(/^材料给出甲车 (-?\d+(?:\.\d+)?) 千米、乙车 (-?\d+(?:\.\d+)?) 千米和行驶时间 (-?\d+(?:\.\d+)?) 小时，问题问“两车路程相差多少”。哪一句重述最准确？$/);
  if (match) return optionsEqualTo(options, "用两车路程相减");

  match = question.match(/^要计算 (-?\d+(?:\.\d+)?) 本书的总价，已知每本 (-?\d+(?:\.\d+)?) 元。必须使用的两个条件是：$/);
  if (match) return optionsEqualTo(options, "本数和单价");

  match = question.match(/^想求长方形面积，材料只给出长 (-?\d+(?:\.\d+)?) 厘米和周长 (-?\d+(?:\.\d+)?) 厘米。下一步最合理的是：$/);
  if (match) return optionsEqualTo(options, "先由周长求宽");

  match = question.match(/^教室门的高度约为 (-?\d+(?:\.\d+)?)，最合适的单位是：$/);
  if (match) return optionsEqualTo(options, "米");

  match = question.match(/^准备精算 (.+) 前，哪一个范围最合理？$/);
  if (match) {
    const exact = arithmeticValue(match[1]);
    return options.filter(({ text }) => rangeContains(text, exact));
  }

  match = question.match(/^同学说 (.+) 的结果是 (-?\d+(?:\.\d+)?)。只用数量级判断，哪项最可靠？$/);
  if (match) {
    const exact = arithmeticValue(match[1]);
    const claim = Number(match[2]);
    const relativeDifference = Math.abs(claim - exact) / Math.max(Math.abs(exact), 1);
    return optionsEqualTo(options, relativeDifference > 0.5 ? "结果明显偏离合理范围" : "结果合理");
  }

  match = question.match(/^计算 (.+) 得到 (-?\d+(?:\.\d+)?) 后，哪种检查最有说服力？$/);
  if (match) return optionsEqualTo(options, "用逆运算还原并比较数量级");

  match = question.match(/^小安计算原算式 (.+)，得到答案 (-?\d+(?:\.\d+)?)。他估算结果范围为 (.+)，并用逆运算 (.+) 检查。根据这些证据应判断：$/);
  if (match) {
    const original = parseBinaryOperation(match[1]);
    const claim = Number(match[2]);
    const evidence = parseCheckEquation(match[4]);
    const evidenceSupports = original !== null
      && sameNumber(evaluateBinary(original), claim)
      && rangeContains(match[3], claim)
      && relatedInverseCheck(match[1], claim, match[4])
      && evidence !== null
      && checkIsTrue(evidence);
    return optionsEqualTo(options, evidenceSupports ? "两项检查都支持答案" : "证据互相矛盾，需重算");
  }

  match = question.match(/^关于圆，下面哪一个说法是正确的？$/);
  if (match) return optionsEqualTo(options, "同一个圆的直径长度是半径的2倍");

  match = question.match(/^学校在小明家(北|南|东|西)偏(东|西|北|南) (\d+)° 方向上，那么小明家在学校的什么方向？$/);
  if (match) {
    const opposite = { 北: "南", 南: "北", 东: "西", 西: "东" } as const;
    const first = match[1] as keyof typeof opposite;
    const second = match[2] as keyof typeof opposite;
    return optionsEqualTo(options, `${opposite[first]}偏${opposite[second]} ${match[3]}°`);
  }

  match = question.match(/^小丽从家出发，先向正东走 \d+ 米，再向正北走 \d+ 米到达学校。学校在小丽家的什么方向？$/);
  if (match) return optionsEqualTo(options, "东北方向");

  match = question.match(/^小丽从家出发，先向正东走 \d+ 米，再向正北走 \d+ 米到达学校。她从学校原路返回家时，先走的方向是？$/);
  if (match) return optionsEqualTo(options, "正南");

  match = question.match(/^公园在学校的北偏西 (\d+)° 方向，书店在学校的南偏东 (\d+)° 方向。公园和书店分别在学校的哪一侧？$/);
  if (match) return optionsEqualTo(options, "西北侧和东南侧");

  match = question.match(/^下面哪一类数据最适合用扇形统计图表示？$/);
  if (match) return optionsEqualTo(options, "各类支出占家庭总支出的百分比");

  match = question.match(/^扇形统计图显示：阅读占 40%、运动占 35%、艺术占 25%。下面哪个说法正确？$/);
  if (match) return optionsEqualTo(options, "喜欢阅读的人数占比最大");

  match = question.match(/^用点阵图解释“1\+3\+5=9”，下面哪个图形正确？$/);
  if (match) return optionsEqualTo(options, "每边 3 个点的正方形点阵");

  match = question.match(/^按规律，第 4 个图形中一共有多少个小正方形？$/);
  if (match) return optionsEqualTo(options, "16 个（每边 4 个的正方形）");

  match = question.match(/^下面哪一个数与 25% 不相等？$/);
  if (match) return optionsEqualTo(options, "2.5");

  match = question.match(/^关于数 0，下面哪一个说法是正确的？$/);
  if (match) return optionsEqualTo(options, "0 既不是正数，也不是负数");

  match = question.match(/^单价一定时，总价与数量成什么比例？$/);
  if (match) return optionsEqualTo(options, "正比例");

  match = question.match(/^下面哪一组中的两个比可以组成比例？$/);
  if (match) return optionsEqualTo(options, "3：5 和 6：10");

  match = question.match(/^把 5 支铅笔放进 4 个笔筒，下面哪个说法一定正确？$/);
  if (match) return optionsEqualTo(options, "总有一个笔筒里至少有 2 支铅笔");

  match = question.match(/^解决工程问题时，通常把这项工程的工作总量看作什么？$/);
  if (match) return optionsEqualTo(options, "单位 1");

  match = question.match(/^比的前项和后项同时乘同一个不为 0 的数，比值会怎样？$/);
  if (match) return optionsEqualTo(options, "不变");

  // P2-9：位数不同的小数竖式加法，先把小数点对齐。两个捕获组仅用于把形态
  // 钉死为「数字 + 数字」的小数/整数加法，避免误锚定同句式的其它竖式题。
  match = question.match(/^用竖式计算 (\d+(?:\.\d+)?) \+ (\d+(?:\.\d+)?) 时，下面哪种做法正确？$/);
  if (match) return optionsEqualTo(options, "小数点对齐");

  // P2-10a：合并分步算式。两个 (.+?) 捕获两个分步算式：每个算式先 split("=")，
  // 再用 arithmeticValue 严格核对等号两边相等；并要求第二步引用第一步得数，
  // 唯一选项须同时满足「得数 = 第二步结果」与「含第一步全部操作数」。候选算式
  // 内容不影响锚定安全性（全部被求值），故不把捕获收窄为数字；不唯一时安全落空。
  match = question.match(/^把两个分步算式 (.+?)、(.+?) 合并成综合算式，得数不变，哪一个正确？$/);
  if (match) {
    const parseStep = (step: string) => {
      const sides = step.split("=");
      if (sides.length !== 2) throw new Error("Invalid step");
      const result = Number(sides[1].trim());
      if (!Number.isFinite(result)) throw new Error("Invalid step result");
      return { expression: sides[0].trim(), result };
    };
    const first = parseStep(match[1]);
    const second = parseStep(match[2]);
    if (Math.abs(arithmeticValue(first.expression) - first.result) > 1e-8
        || Math.abs(arithmeticValue(second.expression) - second.result) > 1e-8) return [];
    const firstTokens: string[] = first.expression.match(/\d+(?:\.\d+)?/g) ?? [];
    const secondTokens: string[] = second.expression.match(/\d+(?:\.\d+)?/g) ?? [];
    if (!secondTokens.includes(String(first.result))) return [];
    const matching = options.filter(({ text }) => {
      try {
        if (Math.abs(arithmeticValue(text) - second.result) > 1e-8) return false;
      } catch {
        return false;
      }
      const optionTokens: string[] = text.match(/\d+(?:\.\d+)?/g) ?? [];
      return firstTokens.every((token) => optionTokens.includes(token));
    });
    return matching.length === 1 ? matching : [];
  }

  // P2-10a：两个混合算式比大小。两个 (.+?) 捕获算式，答案符号完全由两边
  // arithmeticValue 的比较决定，非法算式直接抛错；操作数形态不产生歧义。
  match = question.match(/^比较 (.+) 和 (.+) 的得数，○ 里应填什么？$/);
  if (match) {
    const leftValue = arithmeticValue(match[1]);
    const rightValue = arithmeticValue(match[2]);
    const symbol = leftValue > rightValue ? ">" : leftValue < rightValue ? "<" : "=";
    return optionsEqualTo(options, symbol);
  }

  // P2-10a：按三步简算过程判定所用运算律/性质。三个 (.+?) 为三步算式，全部经
  // arithmeticValue 求值并核对三步得数相等，再按结构变换分类（减法性质/交换律/
  // 分配律）；过程造假或分类失败时安全落空。操作数的具体数字形态不参与分类，故不收窄。
  match = question.match(/^(.+?) = (.+?) = (.+?) 运用了哪一种运算律或性质？$/);
  if (match) {
    const [step1, step2, step3] = match.slice(1);
    const values = [step1, step2, step3].map(arithmeticValue);
    if (values.some((value) => Math.abs(value - values[0]) > 1e-8)) return [];
    const numberTokens = (text: string) => text.match(/\d+(?:\.\d+)?/g) ?? [];
    const operators = (text: string) => normalizeMath(text).match(/[+*/-]/g) ?? [];
    let law: string | null = null;

    // a - b - c = a - (b + c)
    const subtraction = compactMath(step1).match(
      /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/,
    );
    if (subtraction
        && compactMath(step2) === `${subtraction[1]}-(${subtraction[2]}+${subtraction[3]})`) {
      law = "减法的性质";
    }

    // 交换律：操作数与运算符多重集相同，且操作数次序确实改变（fix round 1：
    // 仅加括号导致的 compact 串不同是结合律形态，不得判交换律）。
    if (!law) {
      const sameNumbers = numberTokens(step1).slice().sort().join("|")
        === numberTokens(step2).slice().sort().join("|");
      const orderChanged = numberTokens(step1).join("|") !== numberTokens(step2).join("|");
      const firstOperators = operators(step1);
      const secondOperators = operators(step2);
      const sameOperators = firstOperators.slice().sort().join() === secondOperators.slice().sort().join();
      if (sameNumbers && sameOperators && orderChanged
          && (firstOperators.every((op) => op === "*")
              || firstOperators.every((op) => op === "+"))) {
        law = firstOperators[0] === "*" ? "乘法交换律" : "加法交换律";
      }
    }

    // 分配律：a × (b ± c) 在第三步展开为 a×b ± a×c
    if (!law) {
      const grouped = compactMath(step2).match(
        /^(\d+(?:\.\d+)?)\*\((\d+(?:\.\d+)?)([+\-])(\d+(?:\.\d+)?)\)$/,
      );
      if (grouped) {
        const factor = Number(grouped[1]);
        const expanded = grouped[3] === "+"
          ? factor * Number(grouped[2]) + factor * Number(grouped[4])
          : factor * Number(grouped[2]) - factor * Number(grouped[4]);
        if (Math.abs(arithmeticValue(step3) - expanded) <= 1e-8) law = "乘法分配律";
      }
    }

    return law ? optionsEqualTo(options, law) : [];
  }

  // P2-10b price-model：买 3 件送 1 件，每 4 件为一组只付 3 件的钱。物品名经
  // surfaceVariants 归一为「铅笔」；件数必须是正整数且为 4 的整倍数，应付件数
  // = 3 × 件数 ÷ 4，选项形态钉死为「数字 件」，不满足时安全落空。
  match = question.match(/^文具店促销：铅笔买 3 件送 1 件。要买够 (\d+) 件，实际只需付多少件的钱？$/);
  if (match) {
    const need = Number(match[1]);
    if (!Number.isInteger(need) || need <= 0 || need % 4 !== 0) return [];
    const paid = 3 * need / 4;
    return options.filter(({ text }) => {
      const optionMatch = text.match(/^(\d+) 件$/);
      return optionMatch !== null && Number(optionMatch[1]) === paid;
    });
  }

  // P2-10c spatial：俯视图。由题干堆叠参数（depth 排、每排 width 个、前后对齐）
  // 重算俯视图应为「depth 行，每行 width 个正方形」，与正确选项做语义对应而非
  // 字面钉死；排数或每排个数不是正整数时安全落空。
  match = question.match(/^把相同小正方体摆成 (\d+) 排，每排 (\d+) 个，前后对齐。从上面看，看到的图形是：$/);
  if (match) {
    const depth = Number(match[1]);
    const width = Number(match[2]);
    if (!Number.isInteger(depth) || depth <= 0 || !Number.isInteger(width) || width <= 0) return [];
    return optionsEqualTo(options, `${depth}行，每行${width}个正方形`);
  }

  // P2-10c spatial：添 1 个且正面形状不变。任何一列正上方都会增加该列高度、
  // 旁边空地会出现新列，只有「某列正后方地上」会被原列挡住。先核对原几何体
  // 列数与叠高列合法，再在选项中找列号在 1..count 内的正后方地上选项，唯一
  // 时命中，不唯一安全落空。
  match = question.match(/^用 (\d+) 个小正方体排成一行，并在左数第 (\d+) 个上方再叠 1 个。再添 1 个小正方体，要使从正面看到的形状不变，应该添在哪里？$/);
  if (match) {
    const count = Number(match[1]);
    const tall = Number(match[2]);
    if (!Number.isInteger(count) || count <= 0
        || !Number.isInteger(tall) || tall < 1 || tall > count) return [];
    const valid = options.filter(({ text }) => {
      const behind = text.match(/^左数第(\d+)个的正后方地上$/);
      if (!behind) return false;
      const position = Number(behind[1]);
      return Number.isInteger(position) && position >= 1 && position <= count;
    });
    return valid.length === 1 ? valid : [];
  }

  // P2-10c spatial：1-4-1 正方体展开图对面。中间一行「前、右、后、左」成环，
  // 对面关系前↔后、右↔左；上下两底互为对面。由展开图布局重算所问面的对面。
  match = question.match(/^一个正方体展开图：中间一行从左到右依次写着“前、右、后、左”4个面；“上”在“右”的正上方，“下”在“右”的正下方。“(前|后|左|右|上|下)”面的对面是哪个面？$/);
  if (match) {
    const opposite = { 前: "后", 后: "前", 左: "右", 右: "左", 上: "下", 下: "上" } as const;
    const asked = match[1] as keyof typeof opposite;
    return optionsEqualTo(options, opposite[asked]);
  }

  return null;
}

const unitNames = "平方厘米|平方米|立方厘米|毫米|厘米|千米|毫升|千克|分钟|小时|元|角|分|米|升|克|吨|秒|度|人|个|本|支|盒|张|包|辆|页";
const asksToWriteUnit = /写(?:出|上)?单位|带(?:上)?单位|标明单位|注明单位/;

function inferredRequestedUnit(stem: string): string | undefined {
  const direct = [...stem.matchAll(new RegExp(`(?:多少|几)\\s*(${unitNames})(?=[？?。；，,\\s]|$)`, "g"))];
  if (direct.length > 0) return direct.at(-1)?.[1];
  if (/求盒数\s*x/.test(stem)) return "盒";
  if (asksToWriteUnit.test(stem)) {
    const values = [...stem.matchAll(new RegExp(`-?\\d+(?:\\.\\d+)?\\s*(${unitNames})`, "g"))];
    return values.at(-1)?.[1];
  }
  return undefined;
}

function unitError(expected: string | null, actual: string | null): string | null {
  if (actual === expected) return null;
  return expected !== null && (actual === null || actual.trim() === "")
    ? "missing_unit"
    : "unit_mismatch";
}

function choiceErrors(stem: string, answer: Extract<AnswerSpec, { kind: "choice" }>): string[] {
  const options = choiceOptions(stem);
  if (options.map(({ label }) => label).join("") !== "ABCD") return ["invalid_choice_options"];
  if (new Set(options.map(({ text }) => compactText(text))).size !== options.length) {
    return ["duplicate_choice_option"];
  }
  try {
    const matches = renderedChoiceProof(stem, options);
    if (matches === null) return ["unsupported_choice_pattern"];
    return matches.length === 1 && matches[0].label === answer.value
      ? []
      : ["incorrect_choice_answer"];
  } catch {
    return ["invalid_choice_pattern"];
  }
}

// Every rule below pins the exact wording of one reviewed question form. The catalog also carries a
// bounded set of surface variants per form: a task label or a context noun that never touches the
// numbers, the numeric lockstep or the answer. canonicalStem maps those recognised variants back onto
// the reviewed wording, so each form is still proved from the numbers it actually contains. Adding a
// variant value without teaching it here makes the catalog fail validateCatalog(), never pass silently.
const surfaceVariants: readonly (readonly [RegExp, string])[] = [
  // task labels that replace the reviewed lead-in
  [/^(?:口算|直接写出得数|算一算|填一填|练一练)[：:]/, "口算："],
  [/^(?:计算|笔算|用竖式算|先算再化|先通分再算)[：:]/, "计算 "],
  [/^(?:用简便方法计算|用运算律简算|简便计算)[：:]/, "用简便方法计算 "],
  [/^(?:解方程|求未知数 x|求 x 的值|解出 x)[：:]/, "解方程："],
  // task labels that carry nothing the rule needs
  [/^(?:想一想|看一看|试一试|做一做|画一画|查一查|读懂题目|仔细读题|先看要求|读题时|审题时|先看问题|再看条件|选条件|找条件|整理条件时|读题之后|列式之前|动笔之前|整理图书时|归档资料时|装订手册时|清点作业时|整理试卷时|装订材料时|列方程求解|先列式再计算)[：:，,]/, ""],
  // context nouns
  [/^(?:长方形卡片|长方形照片|长方形书签|长方形桌垫|长方形画框|长方形垫板|长方形地砖|长方形书皮|长方形桌面|长方形画纸|长方形餐垫)(?=长 )/, "长方形"],
  [/^长方形(?:卡纸|木板)的周长/, "一个长方形周长"],
  [/^三角形(?:小红旗|三角尺)的底是/, "三角形底"],
  [/^长方体(?:木块|纸盒|砖块|橡皮|收纳盒|包装箱|冰格)(?=长 )/, "长方体"],
  [/^一块 L 形(?:纸板|铁皮|木板|塑料板|卡纸|铝板|地毯)(?=可看成)/, "一块 L 形纸板"],
  [/^(用 \d+ 个)相同(?:小正方体|小积木|小方块|小木块|小立方体)(?=排成一列)/, "$1相同小正方体"],
  [/^(?:步道的|小路的|跑道的|绳子的|彩带的|泳道的|管道的)第一段长/, "步道前段长"],
  [/第二段长/, "后段长"],
  [/^(?:废纸回收|塑料瓶回收|旧书回收|废电池回收|旧衣物回收|易拉罐回收|旧报纸回收|纸箱回收)(?=记录显示：)/, "条形图文字"],
  [/^(?:读书|练字|背单词|做口算|做题|记笔记|看课外书)(?=折线记录中，)/, ""],
  [/^四次(?:数学|语文|英语|科学|体育|音乐|书法|美术|信息)(?=练习得分依次为)/, "四次"],
  [/(甲组|乙组)(?:成绩|身高|跳远距离|握力|每日做题数|每天阅读时间|每周锻炼次数)(?=是 )/g, "$1数据"],
  [/^(?:阅读记录|值日记录|训练记录|兴趣小组记录|社团活动记录|研学记录|实践记录|调查记录)(?=：)/, "阅读记录"],
  [/^(?:袋|盒|箱|抽屉|抽奖箱|收纳盒|纸盒)中有/, "袋中有"],
  [/^(?:练习册|笔记本|图画本|故事书|作业本|草稿本)(?= \d)/, "每本练习册"],
  [/^(?:小车|客车|货车|面包车|越野车|校车)(?=先以每小时)/, "小车"],
  [/^(?:整理图书时|归档资料时|装订手册时|清点作业时|整理试卷时|装订材料时)(?=：)/, ""],
  [/^(?:红、蓝卡片|红、蓝贴纸|红、蓝小球|黄、绿卡片|白、蓝棋子|红、蓝发圈)(?=数量比是)/, "红、蓝卡片"],
  [/(数量比是 -?\d+(?:\.\d+)?:-?\d+(?:\.\d+)?，共有 )(-?\d+(?:\.\d+)?) (?:张|个|枚)。/, "$1$2 张。"],
  [/(?:红卡片|红贴纸|红球|黄卡片|白棋子|红发圈)有多少(?:张|个|枚)/, "红卡片有多少张"],
  [/^(?:一件文具|一本字典|一个书包|一套画笔|一个文具盒|一副球拍)(?=原价)/, "一件文具"],
  [/箱(?:练习本|粉笔|彩纸|图画纸|卡纸)，每箱/, "箱纸，每箱"],
  [/^一批(?:书|绘本|杂志|故事书|童话集|科普读物)(?=先借出)/, "一批书"],
  [/^(?:图书角|阅览室|班级书架|校图书馆|读书角|流动书箱)有/, "图书角有"],
  [/(?<=有)(?:童话书|连环画|寓言书|童话集|名人故事)(?= \d+ 本、)/, "故事书"],
  [/(?<=今天借出)(?:童话书|连环画|寓言书|童话集|名人故事)(?= \d+ 本)/, "故事书"],
  [/(?:童话书|连环画|寓言书|童话集|名人故事)(?=还剩多少本)/, "故事书"],
  [/(?:大巴|中巴|客车|旅游车|校车|商务车)(?=每辆坐)/, "大巴"],
  [/(?<=多少辆)(?:中巴|客车|旅游车|校车|商务车)(?=？)/, "大巴"],
  // equation wording
  [/^(?:小禾|小安|小宁)(?=检查方程)/, ""],
  [/^(?:小舟|小星)(?=检查方程)/, ""],
  [/^(?:小舟|小宁)(?=解 )/, ""],
  [/时，(?:小舟|小宁)写成/, "时，小禾写成"],
  [/^(两种装盒方案数量相同：方案甲每组 \d+ )[盒袋箱筐](并另加括号内的 \d+ )[盒袋箱筐](，方案乙有 \d+x )[盒袋箱筐](再加 \d+ )[盒袋箱筐](。根据 .+ 求 x。)$/, "$1盒$2盒$3盒$4盒$5"],
  [/^(?:袋|箱)(?=中原有 x 枚棋子)/, "盒"],
  // angle wording
  [/(?<=，)已知一个角是/, "其中一个是"],
  [/求另一个角的度数/, "另一个是多少度"],
  [/另一个角是多少度/, "另一个是多少度"],
  [/^把一个 (-?\d+(?:\.\d+)?) 度的角与另一个角拼在一起正好是一个平角/, "一个平角被分成两个角，其中一个是 $1 度"],
  // P2-10b price-model：新物品/促销名归一到 canonical 用词。
  [/^(?:笔记本|图画本|练习本)(?=一盒有)/, "笔记本"],
  [/^(?:圆珠笔|钢笔|铅笔)(?=每支 \d+ 元，买 \d+ 支；)/, "圆珠笔"],
  [/(?<=；)(?:笔记本|草稿本|图画本)(?=每本 \d+ 元，买 \d+ 本。一共要付)/, "笔记本"],
  [/(?<=：)(?:铅笔|橡皮|尺子)(?=买 3 件送 1 件。要买够)/, "铅笔"],
  // P2-10b distance-model：车辆名归一到 canonical 用词，三种句式互不可替代。
  [/^(?:客车|货车|小轿车)(?=行驶 \d+ 千米，每小时行 \d+ 千米，需要)/, "客车"],
  [/^(?:大巴|中巴|客车)(?= \d+ 小时行驶 \d+ 千米，每小时行多少千米)/, "大巴"],
  [/^(?:小车|客车|货车)(?=从甲地到乙地，去时每小时行)/, "小车"],
];

function canonicalStem(stem: string): string {
  return surfaceVariants.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), stem);
}

export function renderedQuestionErrors(input: {
  answerMode: "mental" | "written" | "choice" | "fill" | "expression" | "equation";
  stem: string;
  answerSpec: AnswerSpec;
}): string[] {
  const { answerMode, answerSpec } = input;
  const stem = canonicalStem(input.stem);
  if ((answerMode === "choice") !== (answerSpec.kind === "choice")) {
    return ["answer_mode_mismatch"];
  }
  if (answerSpec.kind === "choice") return choiceErrors(stem, answerSpec);
  if (answerMode === "equation") {
    const request = equationRequest(stem);
    if (!request) return ["unsolvable_equation"];
    try {
      const solution = equationSolution(request.expression);
      const errors: string[] = [];
      const unitIssue = unitError(request.unit, answerSpec.unit);
      if (unitIssue) errors.push(unitIssue);
      if (Math.abs(solution - answerSpec.value) > 1e-8) {
        errors.push("incorrect_equation_answer");
      }
      return errors;
    } catch {
      return ["unsolvable_equation"];
    }
  }

  try {
    const proof = numberProof(stem);
    if (!proof) {
      const errors: string[] = [];
      const requestedUnit = inferredRequestedUnit(stem);
      if (requestedUnit !== undefined) {
        const issue = unitError(requestedUnit, answerSpec.unit);
        if (issue) errors.push(issue);
      }
      errors.push("unsupported_number_pattern");
      return errors;
    }
    const errors: string[] = [];
    const unitIssue = unitError(proof.unit, answerSpec.unit);
    if (unitIssue) errors.push(unitIssue);
    if (Math.abs(proof.value - answerSpec.value) > 1e-8) {
      errors.push("incorrect_number_answer");
    }
    return errors;
  } catch {
    return ["invalid_number_pattern"];
  }
}
