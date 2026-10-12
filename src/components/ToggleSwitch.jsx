export default function ToggleSwitch({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`toggle-switch ${checked ? 'on' : ''}`}
      onClick={onChange}
    >
      <span className="toggle-knob" />
    </button>
  )
}