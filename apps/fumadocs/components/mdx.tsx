import { Accordion, Accordions } from 'fumadocs-ui/components/accordion';
import { Callout } from 'fumadocs-ui/components/callout';
import { Card, type CardProps, Cards } from 'fumadocs-ui/components/card';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import {
  ArrowLeftRight,
  BookOpen,
  Braces,
  Clock3,
  Code,
  ExternalLink,
  Globe,
  Inbox,
  KeyRound,
  Reply,
  Rocket,
  Send,
  TriangleAlert,
  Webhook,
} from 'lucide-react';
import type { MDXComponents } from 'mdx/types';
import type { ComponentProps, ReactNode } from 'react';

const cardIcons = {
  'arrow-right-arrow-left': ArrowLeftRight,
  'brackets-curly': Braces,
  'exclamation-triangle': TriangleAlert,
  'external-link': ExternalLink,
  'paper-plane': Send,
  book: BookOpen,
  clock: Clock3,
  code: Code,
  globe: Globe,
  inbox: Inbox,
  key: KeyRound,
  reply: Reply,
  rocket: Rocket,
  webhook: Webhook,
};

function MdxCard({ icon, ...props }: CardProps) {
  const Icon =
    typeof icon === 'string'
      ? cardIcons[icon as keyof typeof cardIcons]
      : undefined;

  return <Card {...props} icon={Icon ? <Icon /> : icon} />;
}

function TitledStep({
  title,
  children,
}: ComponentProps<typeof Step> & { title?: ReactNode }) {
  return (
    <Step>
      {title ? <h3>{title}</h3> : null}
      {children}
    </Step>
  );
}

function Note(props: ComponentProps<typeof Callout>) {
  return <Callout type="info" {...props} />;
}

function Tip(props: ComponentProps<typeof Callout>) {
  return <Callout type="idea" {...props} />;
}

function Warning(props: ComponentProps<typeof Callout>) {
  return <Callout type="warn" {...props} />;
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Accordion,
    AccordionGroup: Accordions,
    Card: MdxCard,
    CardGroup: Cards,
    Info: Note,
    Note,
    Step: TitledStep,
    Steps,
    Tab,
    Tabs,
    Tip,
    Warning,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
