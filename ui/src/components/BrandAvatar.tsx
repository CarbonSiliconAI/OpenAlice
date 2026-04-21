interface BrandAvatarProps {
  size?: number
  className?: string
}

export default function BrandAvatar({ size = 32, className = '' }: BrandAvatarProps) {
  return (
    <div
      role="img"
      aria-label="Adrian avatar"
      className={`rounded-full bg-slate-700 text-white flex items-center justify-center font-semibold ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      A
    </div>
  )
}
