"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface WikiEntry {
  title: string;
  content: string;
  createdAt: string;
}

interface WikiEditorProps {
  slug: string;
}

export function WikiEditor({ slug }: WikiEditorProps) {
  const [entries, setEntries] = useState<WikiEntry[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadEntries() {
      const response = await fetch(`/api/collections/${slug}/wiki`);
      const data = (await response.json()) as { entries: WikiEntry[] };
      setEntries(data.entries);
    }
    void loadEntries();
  }, [slug]);

  async function onSubmit() {
    if (!title.trim() || !content.trim()) {
      return;
    }
    setLoading(true);
    const response = await fetch(`/api/collections/${slug}/wiki`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    const data = (await response.json()) as { entries: WikiEntry[] };
    setEntries(data.entries);
    setTitle("");
    setContent("");
    setLoading(false);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-lg border p-3">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Add wiki update title"
        />
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Describe history, founder context, and notable events"
        />
        <Button onClick={onSubmit} disabled={loading}>
          {loading ? "Saving..." : "Submit community wiki update"}
        </Button>
      </div>
      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={`${entry.title}-${entry.createdAt}`} className="rounded-md border p-3 text-sm">
            <p className="font-medium">{entry.title}</p>
            <p className="mt-1 text-muted-foreground">{entry.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
