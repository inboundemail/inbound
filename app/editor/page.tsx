'use client';

import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';

import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { AutoLinkNode, LinkNode } from '@lexical/link';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { HorizontalRuleNode } from '@lexical/react/LexicalHorizontalRuleNode';

import { EditorToolbar } from '@/components/editor/editor-toolbar';
import { SlashCommandsPlugin } from '@/components/editor/slash-commands-plugin';
import { AutoFocusPlugin } from '@/components/editor/auto-focus-plugin';

import { EditorState } from 'lexical';
import { SiteHeader } from '@/components/site-header';

const theme = {
  ltr: 'ltr',
  rtl: 'rtl',
  placeholder: 'text-muted-foreground',
  paragraph: 'mb-1',
  quote: 'border-l-4 border-border pl-4 italic text-muted-foreground my-4',
  heading: {
    h1: 'text-3xl font-bold mb-4',
    h2: 'text-2xl font-bold mb-3',
    h3: 'text-xl font-bold mb-2',
    h4: 'text-lg font-bold mb-2',
    h5: 'text-base font-bold mb-1',
    h6: 'text-sm font-bold mb-1',
  },
  list: {
    nested: {
      listitem: 'list-none',
    },
    ol: 'list-decimal list-inside my-2',
    ul: 'list-disc list-inside my-2',
    listitem: 'my-1',
    listitemChecked: 'relative line-through',
    listitemUnchecked: 'relative',
  },
  link: 'text-primary underline hover:text-primary/80',
  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    underlineStrikethrough: 'underline line-through',
    code: 'bg-muted px-1 py-0.5 rounded text-sm font-mono',
  },
  code: 'bg-muted p-4 rounded-lg font-mono text-sm overflow-x-auto block my-2',
  codeHighlight: {
    atrule: 'text-purple-600',
    attr: 'text-blue-600',
    boolean: 'text-orange-600',
    builtin: 'text-purple-600',
    cdata: 'text-gray-600',
    char: 'text-green-600',
    class: 'text-blue-600',
    'class-name': 'text-blue-600',
    comment: 'text-gray-500 italic',
    constant: 'text-orange-600',
    deleted: 'text-red-600',
    doctype: 'text-gray-600',
    entity: 'text-orange-600',
    function: 'text-purple-600',
    important: 'text-red-600',
    inserted: 'text-green-600',
    keyword: 'text-purple-600',
    namespace: 'text-blue-600',
    number: 'text-orange-600',
    operator: 'text-gray-700',
    prolog: 'text-gray-600',
    property: 'text-blue-600',
    punctuation: 'text-gray-700',
    regex: 'text-green-600',
    selector: 'text-green-600',
    string: 'text-green-600',
    symbol: 'text-orange-600',
    tag: 'text-red-600',
    url: 'text-blue-600',
    variable: 'text-blue-600',
  },
  table: 'border-collapse table-auto w-full my-4',
  tableCell: 'border border-border px-4 py-2',
  tableCellHeader: 'border border-border px-4 py-2 bg-muted font-bold',
};

function onError(error: Error) {
  console.error(error);
}

const initialConfig = {
  namespace: 'InboundEditor',
  theme,
  onError,
  nodes: [
    HeadingNode,
    ListNode,
    ListItemNode,
    QuoteNode,
    CodeNode,
    CodeHighlightNode,
    TableNode,
    TableCellNode,
    TableRowNode,
    AutoLinkNode,
    LinkNode,
    HorizontalRuleNode,
  ],
};

function onChange(editorState: EditorState) {
  editorState.read(() => {
    // Handle editor state changes here
    // console.log('Editor state changed');
  });
}

export default function EditorPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="max-w-4xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-2">Email Editor</h1>
          <p className="text-muted-foreground">Create and edit your email content with rich text formatting and slash commands.</p>
        </div>
        
        <div className="border rounded-lg bg-card">
          <LexicalComposer initialConfig={initialConfig}>
            <div className="border-b">
              <EditorToolbar />
            </div>
            
            <div className="relative">
              <RichTextPlugin
                contentEditable={
                  <ContentEditable
                    className="min-h-[400px] resize-none text-base caret-primary selection:bg-primary/20 outline-none p-6 font-sans tracking-normal"
                    aria-placeholder="Type '/' for commands..."
                    placeholder={
                      <div className="absolute top-6 left-6 text-muted-foreground pointer-events-none font-sans tracking-normal">
                        Type '/' for commands...
                      </div>
                    }
                  />
                }
                ErrorBoundary={LexicalErrorBoundary}
              />
              
              <OnChangePlugin onChange={onChange} />
              <HistoryPlugin />
              <ListPlugin />
              <LinkPlugin />
              <MarkdownShortcutPlugin />
              <TabIndentationPlugin />
              <TablePlugin />
              <AutoFocusPlugin />
              <SlashCommandsPlugin />
            </div>
          </LexicalComposer>
        </div>
      </div>
    </div>
  );
}
