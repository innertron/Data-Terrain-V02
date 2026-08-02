import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";

// Explicit types derived from schema for frontend use
type Segment = z.infer<typeof api.segments.list.responses[200]>[number];
type UpdateSegmentInput = z.infer<typeof api.segments.update.input>;

export function useSegments() {
  return useQuery({
    queryKey: [api.segments.list.path],
    staleTime: 0,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const res = await fetch(api.segments.list.path, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch segments");
      return api.segments.list.responses[200].parse(await res.json());
    },
  });
}

export function useUpdateSegment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & UpdateSegmentInput) => {
      const url = buildUrl(api.segments.update.path, { id });
      const validated = api.segments.update.input.parse(updates);
      
      const res = await fetch(url, {
        method: api.segments.update.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validated),
        credentials: "include",
      });

      if (!res.ok) {
        if (res.status === 404) throw new Error("Segment not found");
        throw new Error("Failed to update segment");
      }

      return api.segments.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.segments.list.path] });
    },
  });
}
