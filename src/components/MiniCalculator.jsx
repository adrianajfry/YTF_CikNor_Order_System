import { useState } from 'react'

const OPS = ['+', '-', '×', '÷']
const isOp = (c) => c !== '' && OPS.includes(c)
const KEYS = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '-', '0', '.', '⌫', '+']

function evaluate(expr) {
  const cleaned = expr.replace(/[+\-×÷.]+$/, '')
  if (!cleaned) return null
  const tokens = cleaned.match(/\d+\.?\d*|\.\d+|[+\-×÷]/g)
  if (!tokens) return null

  // multiply and divide first
  const stack = []
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === '×' || t === '÷') {
      const left = parseFloat(stack.pop())
      const right = parseFloat(tokens[++i])
      if (t === '÷' && right === 0) return null
      stack.push(String(t === '×' ? left * right : left / right))
    } else {
      stack.push(t)
    }
  }

  // then add and subtract
  let result = parseFloat(stack[0])
  for (let i = 1; i < stack.length; i += 2) {
    const value = parseFloat(stack[i + 1])
    result = stack[i] === '+' ? result + value : result - value
  }
  return Number.isFinite(result) ? Math.round(result * 100) / 100 : null
}

export default function MiniCalculator({ onUse }) {
  const [expr, setExpr] = useState('')

  function press(key) {
    setExpr((prev) => {
      if (key === '⌫') return prev.slice(0, -1)
      if (prev.length >= 30) return prev
      const last = prev.slice(-1)
      if (isOp(key)) {
        if (prev === '') return prev
        if (isOp(last)) return prev.slice(0, -1) + key
        return prev + key
      }
      if (key === '.') {
        const currentNumber = prev.split(/[+\-×÷]/).pop()
        if (currentNumber.includes('.')) return prev
        return prev + (currentNumber === '' ? '0.' : '.')
      }
      return prev + key
    })
  }

  const result = evaluate(expr)

  return (
    <div className="mini-calc">
      <div className="mini-calc-display">
        <div className="mini-calc-expr">{expr || ' '}</div>
        <div className="mini-calc-result">{result === null ? '0.00' : result.toFixed(2)}</div>
      </div>
      <div className="mini-calc-grid">
        {KEYS.map((key) => (
          <button key={key} type="button" onClick={() => press(key)}>
            {key === '-' ? '−' : key}
          </button>
        ))}
      </div>
      <div className="mini-calc-actions">
        <button type="button" onClick={() => setExpr('')}>Clear</button>
        <button
          type="button"
          className="btn-primary"
          disabled={result === null || result <= 0}
          onClick={() => onUse(result.toFixed(2))}
        >
          Use as cash received
        </button>
      </div>
    </div>
  )
}