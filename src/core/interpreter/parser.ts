import type {
  BinaryOperator,
  CompareOperator,
  Comprehension,
  Expr,
  FunctionDef,
  Keyword,
  Module,
  Param,
  Slice,
  Stmt,
} from './ast.ts';
import { PyError } from './errors.ts';
import { tokenize, type Token } from './lexer.ts';

const AUGMENTED_ASSIGN: Record<string, BinaryOperator> = {
  '+=': '+', '-=': '-', '*=': '*', '/=': '/', '//=': '//', '%=': '%', '**=': '**',
  '<<=': '<<', '>>=': '>>', '&=': '&', '|=': '|', '^=': '^',
};

const COMPARISON_OPS = new Set(['<', '>', '<=', '>=', '==', '!=']);

const UNSUPPORTED_KEYWORDS = new Set([
  'class', 'import', 'from', 'try', 'except', 'finally', 'raise', 'with', 'yield', 'async', 'await', 'del',
  'assert', 'nonlocal', 'as',
]);

export function parse(source: string): Module {
  return new Parser(tokenize(source)).parseModule();
}

class Parser {
  private pos = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parseModule(): Module {
    const body: Stmt[] = [];
    while (!this.check('eof')) body.push(...this.parseStatement());
    return { body };
  }

  // ---------------------------------------------------------------- token helpers

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]!;
  }

  private advance(): Token {
    const token = this.peek();
    if (token.type !== 'eof') this.pos++;
    return token;
  }

  private check(type: Token['type'], value?: string): boolean {
    const token = this.peek();
    return token.type === type && (value === undefined || token.value === value);
  }

  private checkOp(value: string): boolean {
    return this.check('op', value);
  }

  private checkKeyword(value: string): boolean {
    return this.check('keyword', value);
  }

  private match(type: Token['type'], value?: string): boolean {
    if (!this.check(type, value)) return false;
    this.advance();
    return true;
  }

  private expect(type: Token['type'], value?: string, what?: string): Token {
    if (this.check(type, value)) return this.advance();
    throw this.error(`expected ${what ?? (value ? `'${value}'` : type)}`);
  }

  private expectName(): string {
    return this.expect('name', undefined, 'a name').value;
  }

  private error(message: string, token = this.peek()): PyError {
    const found = token.type === 'eof' ? 'end of file' : token.type === 'newline' ? 'end of line' : `'${token.value}'`;
    return new PyError('SyntaxError', `${message}, found ${found}`, token.line);
  }

  // ---------------------------------------------------------------- statements

  private parseStatement(): Stmt[] {
    const token = this.peek();
    if (token.type === 'keyword') {
      switch (token.value) {
        case 'if':
          return [this.parseIf()];
        case 'while':
          return [this.parseWhile()];
        case 'for':
          return [this.parseFor()];
        case 'def':
          return [this.parseFunctionDef()];
      }
    }
    if (token.type === 'indent') throw new PyError('IndentationError', 'unexpected indent', token.line);
    return this.parseSimpleStatements();
  }

  private parseSimpleStatements(): Stmt[] {
    const stmts = [this.parseSimpleStatement()];
    while (this.match('op', ';')) {
      if (this.check('newline')) break;
      stmts.push(this.parseSimpleStatement());
    }
    if (!this.match('newline') && !this.check('eof')) throw this.error('expected end of statement');
    return stmts;
  }

  private parseSimpleStatement(): Stmt {
    const token = this.peek();
    const line = token.line;
    if (token.type === 'keyword') {
      if (UNSUPPORTED_KEYWORDS.has(token.value)) {
        throw new PyError('SyntaxError', `'${token.value}' is not supported`, line);
      }
      switch (token.value) {
        case 'pass':
          this.advance();
          return { kind: 'Pass', line };
        case 'break':
          this.advance();
          return { kind: 'Break', line };
        case 'continue':
          this.advance();
          return { kind: 'Continue', line };
        case 'return': {
          this.advance();
          const value = this.atStatementEnd() ? null : this.parseTestList();
          return { kind: 'Return', line, value };
        }
        case 'global': {
          this.advance();
          const names = [this.expectName()];
          while (this.match('op', ',')) names.push(this.expectName());
          return { kind: 'Global', line, names };
        }
      }
    }

    const first = this.parseTestList();
    const augmented = this.peek().type === 'op' ? AUGMENTED_ASSIGN[this.peek().value] : undefined;
    if (augmented) {
      this.advance();
      if (first.kind !== 'Name' && first.kind !== 'Subscript') {
        throw new PyError('SyntaxError', "illegal expression for augmented assignment", line);
      }
      return { kind: 'AugAssign', line, target: first, op: augmented, value: this.parseTestList() };
    }
    if (this.checkOp('=')) {
      const targets = [first];
      let value = first;
      while (this.match('op', '=')) {
        value = this.parseTestList();
        targets.push(value);
      }
      targets.pop();
      for (const target of targets) this.validateTarget(target);
      return { kind: 'Assign', line, targets, value };
    }
    return { kind: 'ExprStmt', line, value: first };
  }

  private atStatementEnd(): boolean {
    return this.check('newline') || this.check('eof') || this.checkOp(';');
  }

  private validateTarget(target: Expr): void {
    switch (target.kind) {
      case 'Name':
      case 'Subscript':
        return;
      case 'Tuple':
      case 'List':
        target.elts.forEach((elt) => this.validateTarget(elt));
        return;
      default:
        throw new PyError('SyntaxError', 'cannot assign to expression', target.line);
    }
  }

  /** Parses `:` followed by an indented block or simple statements on the same line. */
  private parseBlock(): Stmt[] {
    this.expect('op', ':');
    if (!this.match('newline')) return this.parseSimpleStatements();
    if (!this.check('indent')) {
      throw new PyError('IndentationError', 'expected an indented block', this.peek().line);
    }
    this.advance();
    const body: Stmt[] = [];
    while (!this.check('dedent') && !this.check('eof')) body.push(...this.parseStatement());
    this.match('dedent');
    return body;
  }

  private parseIf(): Stmt {
    const line = this.advance().line;
    const test = this.parseTest();
    const body = this.parseBlock();
    let orelse: Stmt[] = [];
    if (this.checkKeyword('elif')) {
      orelse = [this.parseIf()];
    } else if (this.match('keyword', 'else')) {
      orelse = this.parseBlock();
    }
    return { kind: 'If', line, test, body, orelse };
  }

  private parseWhile(): Stmt {
    const line = this.advance().line;
    const test = this.parseTest();
    const body = this.parseBlock();
    const orelse = this.match('keyword', 'else') ? this.parseBlock() : [];
    return { kind: 'While', line, test, body, orelse };
  }

  private parseFor(): Stmt {
    const line = this.advance().line;
    const target = this.parseTargetList();
    this.expect('keyword', 'in');
    const iter = this.parseTestList();
    const body = this.parseBlock();
    const orelse = this.match('keyword', 'else') ? this.parseBlock() : [];
    return { kind: 'For', line, target, iter, body, orelse };
  }

  private parseFunctionDef(): FunctionDef {
    const line = this.advance().line;
    const name = this.expectName();
    this.expect('op', '(');
    const params = this.parseParams(')');
    this.expect('op', ')');
    if (this.match('op', '->')) this.parseTest();
    const body = this.parseBlock();
    const { localNames, globalNames } = analyzeScope(body, params);
    return { kind: 'FunctionDef', line, name, params, body, localNames, globalNames };
  }

  private parseParams(terminator: string): Param[] {
    const params: Param[] = [];
    const seen = new Set<string>();
    while (!this.checkOp(terminator)) {
      const token = this.peek();
      const name = this.expectName();
      if (seen.has(name)) throw new PyError('SyntaxError', `duplicate argument '${name}'`, token.line);
      seen.add(name);
      let defaultValue: Expr | null = null;
      if (this.match('op', '=')) {
        defaultValue = this.parseTest();
      } else if (params.some((p) => p.defaultValue !== null)) {
        throw new PyError('SyntaxError', 'non-default argument follows default argument', token.line);
      }
      params.push({ name, defaultValue });
      if (!this.match('op', ',')) break;
    }
    return params;
  }

  // ---------------------------------------------------------------- expressions

  /** Comma-separated expressions; becomes a tuple when there is a comma. */
  private parseTestList(): Expr {
    const line = this.peek().line;
    const first = this.parseTest();
    if (!this.checkOp(',')) return first;
    const elts = [first];
    while (this.match('op', ',')) {
      if (this.atExpressionEnd()) break;
      elts.push(this.parseTest());
    }
    return { kind: 'Tuple', line, elts };
  }

  /** Loop / comprehension targets: parsed below comparisons so that `in` is not consumed. */
  private parseTargetList(): Expr {
    const line = this.peek().line;
    const first = this.parseBitOr();
    let target: Expr = first;
    if (this.checkOp(',')) {
      const elts = [first];
      while (this.match('op', ',')) {
        if (this.checkKeyword('in')) break;
        elts.push(this.parseBitOr());
      }
      target = { kind: 'Tuple', line, elts };
    }
    this.validateTarget(target);
    return target;
  }

  private atExpressionEnd(): boolean {
    const token = this.peek();
    if (token.type === 'newline' || token.type === 'eof') return true;
    return token.type === 'op' && [')', ']', '}', '=', ':', ';'].includes(token.value);
  }

  private parseTest(): Expr {
    if (this.checkKeyword('lambda')) return this.parseLambda();
    const line = this.peek().line;
    const body = this.parseOr();
    if (this.match('keyword', 'if')) {
      const test = this.parseOr();
      this.expect('keyword', 'else');
      const orelse = this.parseTest();
      return { kind: 'IfExp', line, test, body, orelse };
    }
    return body;
  }

  private parseLambda(): Expr {
    const line = this.advance().line;
    const params = this.parseParams(':');
    this.expect('op', ':');
    return { kind: 'Lambda', line, params, body: this.parseTest() };
  }

  private parseOr(): Expr {
    const line = this.peek().line;
    const first = this.parseAnd();
    if (!this.checkKeyword('or')) return first;
    const values = [first];
    while (this.match('keyword', 'or')) values.push(this.parseAnd());
    return { kind: 'BoolOp', line, op: 'or', values };
  }

  private parseAnd(): Expr {
    const line = this.peek().line;
    const first = this.parseNot();
    if (!this.checkKeyword('and')) return first;
    const values = [first];
    while (this.match('keyword', 'and')) values.push(this.parseNot());
    return { kind: 'BoolOp', line, op: 'and', values };
  }

  private parseNot(): Expr {
    if (this.checkKeyword('not')) {
      const line = this.advance().line;
      return { kind: 'UnaryOp', line, op: 'not', operand: this.parseNot() };
    }
    return this.parseComparison();
  }

  private parseComparison(): Expr {
    const line = this.peek().line;
    const left = this.parseBitOr();
    const ops: CompareOperator[] = [];
    const comparators: Expr[] = [];
    for (;;) {
      const op = this.parseCompareOperator();
      if (!op) break;
      ops.push(op);
      comparators.push(this.parseBitOr());
    }
    return ops.length === 0 ? left : { kind: 'Compare', line, left, ops, comparators };
  }

  private parseCompareOperator(): CompareOperator | null {
    const token = this.peek();
    if (token.type === 'op' && COMPARISON_OPS.has(token.value)) {
      this.advance();
      return token.value as CompareOperator;
    }
    if (this.checkKeyword('in')) {
      this.advance();
      return 'in';
    }
    if (this.checkKeyword('not') && this.peek(1).type === 'keyword' && this.peek(1).value === 'in') {
      this.advance();
      this.advance();
      return 'not in';
    }
    if (this.checkKeyword('is')) {
      this.advance();
      return this.match('keyword', 'not') ? 'is not' : 'is';
    }
    return null;
  }

  private parseBinaryLevel(operators: readonly BinaryOperator[], next: () => Expr): Expr {
    let left = next();
    for (;;) {
      const token = this.peek();
      if (token.type !== 'op' || !(operators as readonly string[]).includes(token.value)) return left;
      this.advance();
      const right = next();
      left = { kind: 'BinOp', line: token.line, op: token.value as BinaryOperator, left, right };
    }
  }

  private parseBitOr = (): Expr => this.parseBinaryLevel(['|'], this.parseBitXor);
  private parseBitXor = (): Expr => this.parseBinaryLevel(['^'], this.parseBitAnd);
  private parseBitAnd = (): Expr => this.parseBinaryLevel(['&'], this.parseShift);
  private parseShift = (): Expr => this.parseBinaryLevel(['<<', '>>'], this.parseArith);
  private parseArith = (): Expr => this.parseBinaryLevel(['+', '-'], this.parseTerm);
  private parseTerm = (): Expr => this.parseBinaryLevel(['*', '/', '//', '%'], this.parseFactor);

  private parseFactor = (): Expr => {
    const token = this.peek();
    if (token.type === 'op' && (token.value === '-' || token.value === '+' || token.value === '~')) {
      this.advance();
      return { kind: 'UnaryOp', line: token.line, op: token.value, operand: this.parseFactor() };
    }
    return this.parsePower();
  };

  private parsePower(): Expr {
    const base = this.parsePrimary();
    if (this.checkOp('**')) {
      const line = this.advance().line;
      return { kind: 'BinOp', line, op: '**', left: base, right: this.parseFactor() };
    }
    return base;
  }

  private parsePrimary(): Expr {
    let expr = this.parseAtom();
    for (;;) {
      const token = this.peek();
      if (token.type !== 'op') return expr;
      if (token.value === '(') {
        this.advance();
        const { args, keywords } = this.parseCallArgs();
        this.expect('op', ')');
        expr = { kind: 'Call', line: token.line, func: expr, args, keywords };
      } else if (token.value === '[') {
        this.advance();
        const index = this.parseSubscript();
        this.expect('op', ']');
        expr = { kind: 'Subscript', line: token.line, value: expr, index };
      } else if (token.value === '.') {
        this.advance();
        expr = { kind: 'Attribute', line: token.line, value: expr, attr: this.expectName() };
      } else {
        return expr;
      }
    }
  }

  private parseCallArgs(): { args: Expr[]; keywords: Keyword[] } {
    const args: Expr[] = [];
    const keywords: Keyword[] = [];
    while (!this.checkOp(')')) {
      if (this.check('name') && this.peek(1).type === 'op' && this.peek(1).value === '=') {
        const name = this.advance().value;
        this.advance();
        if (keywords.some((k) => k.name === name)) {
          throw new PyError('SyntaxError', `keyword argument repeated: ${name}`, this.peek().line);
        }
        keywords.push({ name, value: this.parseTest() });
      } else {
        if (keywords.length > 0) throw this.error('positional argument follows keyword argument');
        const line = this.peek().line;
        const value = this.parseTest();
        if (this.checkKeyword('for')) {
          args.push({ kind: 'ListComp', line, elt: value, generators: this.parseComprehensionClauses() });
        } else {
          args.push(value);
        }
      }
      if (!this.match('op', ',')) break;
    }
    return { args, keywords };
  }

  private parseSubscript(): Expr | Slice {
    const line = this.peek().line;
    const lower = this.checkOp(':') ? null : this.parseTestList();
    if (!this.match('op', ':')) {
      if (lower === null) throw this.error('expected an index');
      return lower;
    }
    const upper = this.checkOp(']') || this.checkOp(':') ? null : this.parseTest();
    let step: Expr | null = null;
    if (this.match('op', ':') && !this.checkOp(']')) step = this.parseTest();
    return { kind: 'Slice', line, lower, upper, step };
  }

  private parseComprehensionClauses(): Comprehension[] {
    const generators: Comprehension[] = [];
    while (this.match('keyword', 'for')) {
      const target = this.parseTargetList();
      this.expect('keyword', 'in');
      const iter = this.parseOr();
      const ifs: Expr[] = [];
      while (this.match('keyword', 'if')) ifs.push(this.parseOr());
      generators.push({ target, iter, ifs });
    }
    return generators;
  }

  private parseAtom(): Expr {
    const token = this.peek();
    const line = token.line;
    switch (token.type) {
      case 'name':
        this.advance();
        return { kind: 'Name', line, id: token.value };
      case 'number':
        this.advance();
        return parseNumber(token);
      case 'string': {
        let value = '';
        while (this.check('string')) value += this.advance().value;
        return { kind: 'Str', line, value };
      }
      case 'keyword':
        if (token.value === 'True' || token.value === 'False') {
          this.advance();
          return { kind: 'Bool', line, value: token.value === 'True' };
        }
        if (token.value === 'None') {
          this.advance();
          return { kind: 'NoneLit', line };
        }
        if (UNSUPPORTED_KEYWORDS.has(token.value)) {
          throw new PyError('SyntaxError', `'${token.value}' is not supported`, line);
        }
        break;
      case 'op':
        if (token.value === '(') return this.parseParenthesized();
        if (token.value === '[') return this.parseListDisplay();
        if (token.value === '{') return this.parseBraceDisplay();
        break;
    }
    throw this.error('invalid syntax');
  }

  private parseParenthesized(): Expr {
    const line = this.advance().line;
    if (this.match('op', ')')) return { kind: 'Tuple', line, elts: [] };
    const first = this.parseTest();
    if (this.checkKeyword('for')) {
      const generators = this.parseComprehensionClauses();
      this.expect('op', ')');
      return { kind: 'ListComp', line, elt: first, generators };
    }
    if (this.match('op', ')')) return first;
    const elts = [first];
    while (this.match('op', ',')) {
      if (this.checkOp(')')) break;
      elts.push(this.parseTest());
    }
    this.expect('op', ')');
    return { kind: 'Tuple', line, elts };
  }

  private parseListDisplay(): Expr {
    const line = this.advance().line;
    if (this.match('op', ']')) return { kind: 'List', line, elts: [] };
    const first = this.parseTest();
    if (this.checkKeyword('for')) {
      const generators = this.parseComprehensionClauses();
      this.expect('op', ']');
      return { kind: 'ListComp', line, elt: first, generators };
    }
    const elts = [first];
    while (this.match('op', ',')) {
      if (this.checkOp(']')) break;
      elts.push(this.parseTest());
    }
    this.expect('op', ']');
    return { kind: 'List', line, elts };
  }

  private parseBraceDisplay(): Expr {
    const line = this.advance().line;
    if (this.match('op', '}')) return { kind: 'Dict', line, keys: [], values: [] };
    const first = this.parseTest();
    if (this.match('op', ':')) {
      const keys = [first];
      const values = [this.parseTest()];
      while (this.match('op', ',')) {
        if (this.checkOp('}')) break;
        keys.push(this.parseTest());
        this.expect('op', ':');
        values.push(this.parseTest());
      }
      this.expect('op', '}');
      return { kind: 'Dict', line, keys, values };
    }
    const elts = [first];
    while (this.match('op', ',')) {
      if (this.checkOp('}')) break;
      elts.push(this.parseTest());
    }
    this.expect('op', '}');
    return { kind: 'Set', line, elts };
  }
}

function parseNumber(token: Token): Expr {
  const text = token.value.replace(/_/g, '');
  const line = token.line;
  if (/^0[xXoObB]/.test(text)) {
    const radix = { x: 16, o: 8, b: 2 }[text[1]!.toLowerCase() as 'x' | 'o' | 'b'];
    const value = parseInt(text.slice(2), radix);
    if (Number.isNaN(value)) throw new PyError('SyntaxError', 'invalid number literal', line);
    return { kind: 'Num', line, value, isFloat: false };
  }
  const isFloat = /[.eE]/.test(text);
  return { kind: 'Num', line, value: Number(text), isFloat };
}

/** Python's compile-time scope analysis: every name bound in the body is local unless declared global. */
export function analyzeScope(body: Stmt[], params: Param[]): { localNames: string[]; globalNames: string[] } {
  const locals = new Set(params.map((p) => p.name));
  const globals = new Set<string>();

  const addTarget = (target: Expr) => {
    if (target.kind === 'Name') locals.add(target.id);
    else if (target.kind === 'Tuple' || target.kind === 'List') target.elts.forEach(addTarget);
  };
  const visit = (stmts: Stmt[]) => {
    for (const stmt of stmts) {
      switch (stmt.kind) {
        case 'Assign':
          stmt.targets.forEach(addTarget);
          break;
        case 'AugAssign':
          addTarget(stmt.target);
          break;
        case 'For':
          addTarget(stmt.target);
          visit(stmt.body);
          visit(stmt.orelse);
          break;
        case 'If':
        case 'While':
          visit(stmt.body);
          visit(stmt.orelse);
          break;
        case 'FunctionDef':
          locals.add(stmt.name);
          break;
        case 'Global':
          for (const name of stmt.names) {
            if (params.some((p) => p.name === name)) {
              throw new PyError('SyntaxError', `name '${name}' is parameter and global`, stmt.line);
            }
            globals.add(name);
          }
          break;
        default:
          break;
      }
    }
  };
  visit(body);
  for (const name of globals) locals.delete(name);
  return { localNames: [...locals], globalNames: [...globals] };
}
