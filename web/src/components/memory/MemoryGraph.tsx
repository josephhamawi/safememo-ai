'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { where } from 'firebase/firestore';
import { useFirestoreCollection } from '@/hooks/useFirestoreCollection';
import type { SemanticMemory, MemoryNode, MemoryLink } from '@/types';
import { Loader2, AlertCircle, Network } from 'lucide-react';

interface MemoryGraphProps {
  agentId: string;
}

const SOURCE_COLORS: Record<string, string> = {
  conversation: '#3b82f6',
  document: '#22c55e',
  episodic_promotion: '#a855f7',
};

const SOURCE_GLOW: Record<string, string> = {
  conversation: '#3b82f680',
  document: '#22c55e80',
  episodic_promotion: '#a855f780',
};

function computeGraph(memories: (SemanticMemory & { id: string })[]): {
  nodes: MemoryNode[];
  links: MemoryLink[];
} {
  const nodes: MemoryNode[] = memories.map((m) => ({
    id: m.id,
    content: m.content,
    tags: m.metadata.tags,
    confidence: m.metadata.confidence,
    source: m.metadata.source,
  }));

  const links: MemoryLink[] = [];
  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const tagsA = new Set(memories[i].metadata.tags);
      const tagsB = new Set(memories[j].metadata.tags);
      const intersection = [...tagsA].filter((t) => tagsB.has(t));
      const union = new Set([...tagsA, ...tagsB]);
      if (intersection.length > 0 && union.size > 0) {
        const similarity = intersection.length / union.size;
        if (similarity >= 0.15) {
          links.push({
            source: memories[i].id,
            target: memories[j].id,
            similarity,
          });
        }
      }
    }
  }

  return { nodes, links };
}

export default function MemoryGraph({ agentId }: MemoryGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const simulationRef = useRef<d3.Simulation<MemoryNode, MemoryLink> | null>(null);
  const [selectedNode, setSelectedNode] = useState<MemoryNode | null>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    content: string;
  }>({ visible: false, x: 0, y: 0, content: '' });

  const { data: memories, loading, error } = useFirestoreCollection<SemanticMemory>(
    agentId ? `agents/${agentId}/semanticMemory` : '',
    {
      constraints: [where('metadata.validationStatus', '==', 'approved')],
      enabled: !!agentId,
    }
  );

  const graph = useMemo(() => computeGraph(memories), [memories]);

  const renderGraph = useCallback(() => {
    if (!svgRef.current || !containerRef.current || graph.nodes.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('width', width).attr('height', height);

    // Defs for glow filters
    const defs = svg.append('defs');
    Object.entries(SOURCE_GLOW).forEach(([source, color]) => {
      const filter = defs
        .append('filter')
        .attr('id', `glow-${source}`)
        .attr('x', '-50%')
        .attr('y', '-50%')
        .attr('width', '200%')
        .attr('height', '200%');
      filter
        .append('feGaussianBlur')
        .attr('stdDeviation', '3')
        .attr('result', 'coloredBlur');
      filter
        .append('feFlood')
        .attr('flood-color', color)
        .attr('result', 'glowColor');
      filter
        .append('feComposite')
        .attr('in', 'glowColor')
        .attr('in2', 'coloredBlur')
        .attr('operator', 'in')
        .attr('result', 'softGlow');
      const merge = filter.append('feMerge');
      merge.append('feMergeNode').attr('in', 'softGlow');
      merge.append('feMergeNode').attr('in', 'SourceGraphic');
    });

    const g = svg.append('g');

    // Zoom and pan
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });
    svg.call(zoom);

    // Make working copies for D3 simulation
    const simNodes: (MemoryNode & { x: number; y: number })[] = graph.nodes.map((n) => ({
      ...n,
      x: width / 2 + (Math.random() - 0.5) * 200,
      y: height / 2 + (Math.random() - 0.5) * 200,
    }));

    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

    const simLinks = graph.links
      .filter((l) => nodeMap.has(l.source as string) && nodeMap.has(l.target as string))
      .map((l) => ({
        ...l,
        source: nodeMap.get(l.source as string)!,
        target: nodeMap.get(l.target as string)!,
      }));

    // Links
    const link = g
      .append('g')
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', '#52525b')
      .attr('stroke-opacity', (d) => 0.2 + d.similarity * 0.6)
      .attr('stroke-width', (d) => 0.5 + d.similarity * 2);

    // Nodes
    const node = g
      .append('g')
      .selectAll('circle')
      .data(simNodes)
      .join('circle')
      .attr('r', (d) => 6 + d.confidence * 14)
      .attr('fill', (d) => SOURCE_COLORS[d.source] || '#6b7280')
      .attr('stroke', (d) =>
        selectedNode?.id === d.id ? '#ffffff' : (SOURCE_COLORS[d.source] || '#6b7280')
      )
      .attr('stroke-width', (d) => (selectedNode?.id === d.id ? 2.5 : 1))
      .attr('filter', (d) => `url(#glow-${d.source})`)
      .attr('cursor', 'pointer')
      .on('mouseenter', (event, d) => {
        const [mx, my] = d3.pointer(event, container);
        setTooltip({
          visible: true,
          x: mx + 12,
          y: my - 12,
          content: d.content.length > 200 ? d.content.slice(0, 200) + '...' : d.content,
        });
        d3.select(event.currentTarget).attr('stroke', '#ffffff').attr('stroke-width', 2.5);
      })
      .on('mousemove', (event) => {
        const [mx, my] = d3.pointer(event, container);
        setTooltip((prev) => ({ ...prev, x: mx + 12, y: my - 12 }));
      })
      .on('mouseleave', (event, d) => {
        setTooltip((prev) => ({ ...prev, visible: false }));
        if (selectedNode?.id !== d.id) {
          d3.select(event.currentTarget)
            .attr('stroke', SOURCE_COLORS[d.source] || '#6b7280')
            .attr('stroke-width', 1);
        }
      })
      .on('click', (_event, d) => {
        setSelectedNode((prev) => (prev?.id === d.id ? null : d));
      });

    // Drag behavior
    const drag = d3
      .drag<SVGCircleElement, MemoryNode & { x: number; y: number }>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        (d as any).fx = d.x;
        (d as any).fy = d.y;
      })
      .on('drag', (event, d) => {
        (d as any).fx = event.x;
        (d as any).fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        (d as any).fx = null;
        (d as any).fy = null;
      });

    node.call(drag as any);

    // Labels for selected node
    const label = g
      .append('g')
      .selectAll('text')
      .data(simNodes)
      .join('text')
      .attr('font-size', 10)
      .attr('fill', '#a1a1aa')
      .attr('dx', (d) => 8 + d.confidence * 14)
      .attr('dy', 4)
      .attr('pointer-events', 'none')
      .text((d) => (d.content.length > 40 ? d.content.slice(0, 40) + '...' : d.content))
      .attr('opacity', 0);

    // Force simulation
    const simulation = d3
      .forceSimulation(simNodes)
      .force(
        'link',
        d3
          .forceLink(simLinks)
          .id((d: any) => d.id)
          .distance((d) => 80 + (1 - d.similarity) * 120)
      )
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d: any) => 10 + d.confidence * 16))
      .on('tick', () => {
        link
          .attr('x1', (d: any) => d.source.x)
          .attr('y1', (d: any) => d.source.y)
          .attr('x2', (d: any) => d.target.x)
          .attr('y2', (d: any) => d.target.y);

        node.attr('cx', (d: any) => d.x).attr('cy', (d: any) => d.y);

        label.attr('x', (d: any) => d.x).attr('y', (d: any) => d.y);
      });

    simulationRef.current = simulation as any;

    // Center view
    svg.call(zoom.transform, d3.zoomIdentity.translate(0, 0).scale(1));
  }, [graph, selectedNode]);

  useEffect(() => {
    renderGraph();

    const observer = new ResizeObserver(() => renderGraph());
    if (containerRef.current) observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      simulationRef.current?.stop();
    };
  }, [renderGraph]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-950 text-red-400">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm">Failed to load memory graph</p>
        <p className="text-xs text-zinc-500">{error.message}</p>
      </div>
    );
  }

  if (graph.nodes.length === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-950 text-zinc-500">
        <Network className="h-10 w-10" />
        <p className="text-sm">No approved memories yet</p>
        <p className="text-xs">Approve staging memories to see them here</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full bg-zinc-950">
      <svg ref={svgRef} className="h-full w-full" />

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          className="pointer-events-none absolute z-50 max-w-xs rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-300 shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.content}
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-xs backdrop-blur-sm">
        {Object.entries(SOURCE_COLORS).map(([source, color]) => (
          <div key={source} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }}
            />
            <span className="text-zinc-400 capitalize">{source.replace('_', ' ')}</span>
          </div>
        ))}
      </div>

      {/* Selected node detail */}
      {selectedNode && (
        <div className="absolute right-3 top-3 w-72 rounded-lg border border-zinc-700 bg-zinc-900/95 p-4 shadow-xl backdrop-blur-sm">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-medium text-zinc-200">Memory Detail</h4>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-zinc-500 transition-colors hover:text-zinc-300"
            >
              &times;
            </button>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-zinc-400">{selectedNode.content}</p>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-zinc-500">Confidence:</span>
            <div className="h-1.5 flex-1 rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${selectedNode.confidence * 100}%` }}
              />
            </div>
            <span className="text-xs text-zinc-400">
              {Math.round(selectedNode.confidence * 100)}%
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {selectedNode.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
