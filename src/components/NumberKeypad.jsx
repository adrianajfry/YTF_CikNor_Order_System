const DIGIT_KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫']

export default function NumberKeypad({ value, onChange }) {
  function press(key) {
    if (key === '⌫') {
      onChange(value.slice(0, -1))
      return
    }

    if (key === '.') {
      if (value.includes('.')) return
      onChange(value === '' ? '0.' : value + '.')
      return
    }

    // Digits: at most 2 decimal places, and a sensible overall length
    if (value.includes('.') && value.split('.')[1].length >= 2) return
    if (value.replace('.', '').length >= 7) return
    if (value === '0') {
      onChange(key) // avoid numbers like "05"
      return
    }
    onChange(value + key)
  }

  return (
    <div className="keypad">
      {DIGIT_KEYS.map((key) => (
        <button key={key} type="button" onClick={() => press(key)}>
          {key}
        </button>
      ))}
      <button type="button" className="keypad-clear" onClick={() => onChange('')}>
        Clear
      </button>
    </div>
  )
}