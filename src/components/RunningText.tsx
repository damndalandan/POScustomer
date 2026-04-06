import React, { useRef, useEffect, useState } from 'react'

export default function RunningText({ text, className = '' }: { text: string, className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [isOverflowing, setIsOverflowing] = useState(false)

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        // Only set overflowing if the text is genuinely wider than the container
        setIsOverflowing(textRef.current.scrollWidth > containerRef.current.clientWidth)
      }
    }
    
    // Check initially and on resize
    checkOverflow()
    window.addEventListener('resize', checkOverflow)
    
    // Also re-check slightly after mount in case of font loading layout shifts
    const timeout = setTimeout(checkOverflow, 100)
    
    return () => {
      window.removeEventListener('resize', checkOverflow)
      clearTimeout(timeout)
    }
  }, [text])

  return (
    <div 
      ref={containerRef} 
      className="w-full overflow-hidden whitespace-nowrap" 
      style={{ 
        maskImage: isOverflowing ? 'linear-gradient(to right, black 80%, transparent 100%)' : 'none', 
        WebkitMaskImage: isOverflowing ? 'linear-gradient(to right, black 80%, transparent 100%)' : 'none' 
      }}
    >
      <div 
        ref={textRef} 
        className={`${className} ${isOverflowing ? 'animate-marquee' : ''}`}
        style={{ display: 'inline-block' }}
      >
        {text}
        {isOverflowing && <span className="ml-[50px]">{text}</span>}
      </div>
    </div>
  )
}
