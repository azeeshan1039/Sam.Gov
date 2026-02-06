"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

interface CollapsibleSectionProps {
    title: React.ReactNode
    icon?: React.ReactNode
    defaultOpen?: boolean
    children: React.ReactNode
    className?: string
}

export function CollapsibleSection({
    title,
    icon,
    defaultOpen = true,
    children,
    className,
}: CollapsibleSectionProps) {
    const [isOpen, setIsOpen] = React.useState(defaultOpen)

    return (
        <div className={cn("border rounded-lg bg-card shadow-sm", className)}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors rounded-t-lg"
            >
                <div className="flex items-center gap-2 font-semibold text-lg">
                    {icon}
                    {title}
                </div>
                <ChevronDown
                    className={cn(
                        "h-5 w-5 text-muted-foreground transition-transform duration-200",
                        isOpen ? "rotate-180" : ""
                    )}
                />
            </button>
            <div
                className={cn(
                    "overflow-hidden transition-all duration-300 ease-in-out",
                    isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
                )}
            >
                <div className="p-4 pt-0 border-t">
                    {children}
                </div>
            </div>
        </div>
    )
}
