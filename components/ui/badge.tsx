import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-gray-800 text-gray-300",
        destructive: "border-transparent bg-red-600 text-white",
        outline: "text-foreground",
        moon: "border-transparent bg-green-500/20 text-green-400",
        rekt: "border-transparent bg-red-500/20 text-red-400",
        cope: "border-transparent bg-orange-500/20 text-orange-400",
        degen: "border-transparent bg-purple-500/20 text-purple-400",
        zen: "border-transparent bg-cyan-500/20 text-cyan-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
