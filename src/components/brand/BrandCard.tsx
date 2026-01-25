import * as React from "react"
import { cn } from "@/lib/utils"

interface BrandCardProps extends React.ComponentProps<"div"> {
  variant?: 'default' | 'heavy' | 'hero' | 'muted';
  isInteractive?: boolean;
}

const BrandCard = React.forwardRef<HTMLDivElement, BrandCardProps>(
  ({ className, variant = 'default', isInteractive = false, ...props }, ref) => {
    const variants = {
      default: "bg-brand-glass backdrop-blur-brand border-brand shadow-xl",
      heavy: "bg-brand-glass-heavy backdrop-blur-brand border-brand-heavy shadow-2xl",
      hero: "bg-brand-glass backdrop-blur-brand border-brand-heavy shadow-brand overflow-hidden",
      muted: "bg-muted/10 border-brand/5 backdrop-blur-sm",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-3xl border transition-all duration-300",
          variants[variant],
          isInteractive && "hover:bg-brand-glass/20 hover:scale-[1.01] active:scale-[0.99] cursor-pointer",
          className
        )}
        {...props}
      />
    )
  }
)
BrandCard.displayName = "BrandCard"

const BrandCardContent = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-8", className)} {...props} />
  )
)
BrandCardContent.displayName = "BrandCardContent"

const BrandCardHeader = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("p-8 pb-4 flex items-center justify-between border-b border-brand", className)}
      {...props}
    />
  )
)
BrandCardHeader.displayName = "BrandCardHeader"

const BrandGradientText = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <span className={cn("bg-brand-gradient bg-clip-text text-transparent bg-300% animate-gradient", className)}>
    {children}
  </span>
)

export { BrandCard, BrandCardContent, BrandCardHeader, BrandGradientText }
