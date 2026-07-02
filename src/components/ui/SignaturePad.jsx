import { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useTranslation } from 'react-i18next'

const SignaturePad = forwardRef(function SignaturePad({ disabled = false, height = 150 }, ref) {
  const canvasRef  = useRef(null)
  const drawing    = useRef(false)
  const [empty, setEmpty] = useState(true)
  const { t } = useTranslation()

  useImperativeHandle(ref, () => ({
    getDataURL: () => canvasRef.current?.toDataURL('image/png') ?? null,
    isEmpty:    () => empty,
    clear:      () => {
      const c = canvasRef.current
      if (!c) return
      c.getContext('2d').clearRect(0, 0, c.width, c.height)
      setEmpty(true)
    },
  }))

  // Resize canvas to match display size (prevents scaling blurriness)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr  = window.devicePixelRatio || 1
      canvas.width  = rect.width  * dpr
      canvas.height = rect.height * dpr
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  const getXY = (e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const src  = e.touches ? e.touches[0] : e
    return {
      x: src.clientX - rect.left,
      y: src.clientY - rect.top,
    }
  }

  const startDraw = (e) => {
    if (disabled) return
    e.preventDefault()
    drawing.current = true
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const { x, y } = getXY(e, canvas)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  const draw = (e) => {
    if (!drawing.current || disabled) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    ctx.lineWidth   = 2
    ctx.lineCap     = 'round'
    ctx.lineJoin    = 'round'
    ctx.strokeStyle = '#1e293b'
    const { x, y } = getXY(e, canvas)
    ctx.lineTo(x, y)
    ctx.stroke()
    setEmpty(false)
  }

  const stopDraw = (e) => {
    e?.preventDefault()
    drawing.current = false
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height, display: 'block', touchAction: 'none', cursor: disabled ? 'default' : 'crosshair' }}
          className={`rounded-xl border-2 ${disabled ? 'bg-gray-50 border-gray-100' : 'bg-white border-gray-300 hover:border-brand-400'}`}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
        {empty && !disabled && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-gray-300 pointer-events-none select-none">
            {t('signature.placeholder')}
          </p>
        )}
      </div>
      {!disabled && (
        <button
          type="button"
          onClick={() => {
            const canvas = canvasRef.current
            canvas?.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
            setEmpty(true)
          }}
          className="text-xs text-gray-400 hover:text-gray-600 self-start underline underline-offset-2"
        >
          {t('signature.clear')}
        </button>
      )}
    </div>
  )
})

export default SignaturePad
