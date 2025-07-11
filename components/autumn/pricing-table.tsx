"use client";

import React from "react";
import { createContext, useContext, useState } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import Check2 from "@/components/icons/check-2";
import Loader from "@/components/icons/loader";
import { useSession } from "@/lib/auth/auth-client";
import Link from "next/link";

export interface Product {
  id: string;
  name: string;
  description?: string;
  everythingFrom?: string;

  buttonText?: string;
  buttonUrl?: string;

  recommendedText?: string;

  price: {
    primaryText: string;
    secondaryText?: string;
  };

  priceAnnual?: {
    primaryText: string;
    secondaryText?: string;
  };

  items: {
    primaryText: string;
    secondaryText?: string;
  }[];
}

const PricingTableContext = createContext<{
  isAnnual: boolean;
  setIsAnnual: (isAnnual: boolean) => void;
  products: Product[];
  showFeatures: boolean;
  uniform: boolean;
}>({
  isAnnual: false,
  setIsAnnual: () => {},
  products: [],
  showFeatures: true,
  uniform: false,
});

export const usePricingTableContext = (componentName: string) => {
  const context = useContext(PricingTableContext);

  if (context === undefined) {
    throw new Error(`${componentName} must be used within <PricingTable />`);
  }

  return context;
};

export const PricingTable = ({
  children,
  products,
  showFeatures = true,
  className,
  uniform = false,
}: {
  children?: React.ReactNode;
  products?: Product[];
  showFeatures?: boolean;
  className?: string;
  uniform?: boolean;
}) => {
  const [isAnnual, setIsAnnual] = useState(false);
  const session = useSession();

  if (!products) {
    throw new Error("products is required in <PricingTable />");
  }

  if (products.length === 0) {
    return <></>;
  }
  const hasEvenProducts = products.length % 2 === 0;

  return (
    <PricingTableContext.Provider
      value={{ isAnnual, setIsAnnual, products, showFeatures, uniform }}
    >
      <div className={cn("flex items-center flex-col space-y-8")}>
        {products.some((p) => p.priceAnnual) && (
          <div>
            <AnnualSwitch isAnnual={isAnnual} setIsAnnual={setIsAnnual} />
          </div>
        )}
        <div
          className={cn(
            "w-full grid grid-cols-1 gap-6 max-w-6xl mx-auto",
            hasEvenProducts && "sm:grid-cols-2",
            products.length >= 3 && "lg:grid-cols-3",
            className
          )}
        >
          {children}
        </div>
      </div>
    </PricingTableContext.Provider>
  );
};

interface PricingCardProps {
  productId: string;
  showFeatures?: boolean;
  className?: string;
  onButtonClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  buttonProps?: React.ComponentProps<"button">;
}

export const PricingCard = ({
  productId,
  className,
  onButtonClick,
  buttonProps,
}: PricingCardProps) => {
  const { isAnnual, products, showFeatures, uniform } =
    usePricingTableContext("PricingCard");
  const { data: session } = useSession();
  const product = products.find((p) => p.id === productId);

  if (!product) {
    throw new Error(`Product with id ${productId} not found`);
  }

  const {
    name,
    price,
    priceAnnual,
    recommendedText,
    buttonText,
    items,
    description,
    buttonUrl,
    everythingFrom,
  } = product;

  const isRecommended = recommendedText ? true : false;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card text-card-foreground shadow relative flex flex-col h-full",
        isRecommended && "border-primary shadow-lg scale-105 bg-primary/5",
        className
      )}
    >
      {recommendedText && (
        <RecommendedBadge recommended={recommendedText} />
      )}
      
      <div className="flex flex-col h-full p-6">
        {/* Header */}
        <div className="flex flex-col space-y-1.5 pb-4">
          <h2 className="text-2xl font-semibold leading-none tracking-tight">{name}</h2>
          {description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {description}
            </p>
          )}
        </div>

        {/* Price */}
        {price.primaryText.toLowerCase() !== "free" ? (
          <div className="border-t border-b py-4 mb-6">
            <div className="text-3xl font-bold">
              {isAnnual && priceAnnual
                ? priceAnnual?.primaryText
                : price.primaryText}
            </div>
            {price.secondaryText && (
              <div className="text-sm text-muted-foreground mt-1">
                {isAnnual && priceAnnual
                  ? priceAnnual?.secondaryText
                  : price.secondaryText}
              </div>
            )}
          </div>
        ) : (
          <div className="border-t py-4">
          </div>
        )
        }

        {/* Features */}
        {showFeatures && items.length > 0 && (
          <div className="flex-grow mb-6">
            <PricingFeatureList
              items={items}
              showIcon={true}
              everythingFrom={everythingFrom}
            />
          </div>
        )}

        {/* Button */}
        {session ? (
        <div className="mt-auto pt-4">
          <PricingCardButton
            recommended={isRecommended}
            onClick={onButtonClick}
            buttonUrl={buttonUrl}
            {...buttonProps}
          >
            {buttonText}
          </PricingCardButton>
        </div>
        ) : (
          <div className="mt-auto pt-4">
            <Link href="/login">
              <Button variant="primary" className="w-full">
                Login to get started
              </Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

// Pricing Feature List
export const PricingFeatureList = ({
  items,
  showIcon = true,
  everythingFrom,
  className,
}: {
  items: {
    primaryText: string;
    secondaryText?: string;
  }[];
  showIcon?: boolean;
  everythingFrom?: string;
  className?: string;
}) => {
  return (
    <div className={cn("space-y-3", className)}>
      {everythingFrom && (
        <p className="text-sm text-muted-foreground mb-4">Everything from {everythingFrom}, plus:</p>
      )}
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-3 text-sm">
          {showIcon && (
            <Check2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
          )}
          <div className="flex flex-col">
            <span className="text-card-foreground">{item.primaryText}</span>
            {item.secondaryText && (
              <span className="text-xs text-muted-foreground mt-1">
                {item.secondaryText}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// Pricing Card Button
export interface PricingCardButtonProps extends React.ComponentProps<"button"> {
  recommended?: boolean;
  buttonUrl?: string;
}

export const PricingCardButton = React.forwardRef<
  HTMLButtonElement,
  PricingCardButtonProps
>(({ recommended, children, buttonUrl, onClick, className, ...props }, ref) => {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      className={cn(
        "w-full",
        className
      )}
      variant={recommended ? "primary" : "secondary"}
      size="lg"
      ref={ref}
      disabled={loading}
      onClick={async (e) => {
        setLoading(true);
        try {
          if (onClick) {
            await onClick(e);
            return;
          }

          if (buttonUrl) {
            window.open(buttonUrl, "_blank");
            return;
          }
        } catch (error) {
          throw error;
        } finally {
          setLoading(false);
        }
      }}
      {...props}
    >
      {loading ? (
        <Loader className="h-4 w-4 animate-spin" />
      ) : (
        children
      )}
    </Button>
  );
});
PricingCardButton.displayName = "PricingCardButton";

// Annual Switch
export const AnnualSwitch = ({
  isAnnual,
  setIsAnnual,
}: {
  isAnnual: boolean;
  setIsAnnual: (isAnnual: boolean) => void;
}) => {
  return (
    <div className="flex items-center justify-center space-x-3 p-4 rounded-xl border bg-card">
      <span className={cn("text-sm font-medium", !isAnnual ? "text-card-foreground" : "text-muted-foreground")}>
        Monthly
      </span>
      <Switch
        id="annual-billing"
        checked={isAnnual}
        onCheckedChange={setIsAnnual}
      />
      <span className={cn("text-sm font-medium", isAnnual ? "text-card-foreground" : "text-muted-foreground")}>
        Annual
      </span>
      {isAnnual && (
        <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full font-medium">
          Save 20%
        </span>
      )}
    </div>
  );
};

export const RecommendedBadge = ({ recommended }: { recommended: string }) => {
  return (
    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground text-sm font-medium px-3 py-1 rounded-full border">
      {recommended}
    </div>
  );
};
