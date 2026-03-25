<script lang="ts">
  import { extent, max } from 'd3-array';
  import { axisBottom, axisLeft, axisRight } from 'd3-axis';
  import { select, type Selection } from 'd3-selection';
  import { curveMonotoneX, line } from 'd3-shape';
  import { onDestroy, onMount } from 'svelte';

  import BaseChart from './BaseChart.svelte';
  import { createGridLines, createDateAxisFormatter, addAxisLabel } from './utils/axes';
  import { ChartTooltip } from './utils/interactions';
  import { createLinearScale, createTimeScale } from './utils/scales';
  import type { ChartTheme } from './utils/theme';
  import { t } from '$lib/i18n';
  import { getLocalDateString } from '$lib/utils/date';
  import type { BirdMigrationActivityDatum } from '../../../utils/birdMigration';

  interface ActivityDatum {
    date: Date;
    detectionCount: number;
    activeSpeciesCount: number;
  }

  interface Props {
    data: BirdMigrationActivityDatum[];
    width?: number;
    height?: number;
  }

  const BAR_OPACITY = 0.22;
  const LINE_STROKE_WIDTH = 2.5;
  const POINT_RADIUS = 3;
  const POINT_HOVER_RADIUS = 5.5;
  const MAX_X_TICKS = 8;
  const X_TICK_SPACING = 80;
  const Y_TICK_COUNT = 5;
  const X_AXIS_LABEL_OFFSET = 38;
  const LEFT_AXIS_LABEL_OFFSET = 46;
  const RIGHT_AXIS_LABEL_OFFSET = 46;

  let { data = [], width = 800, height = 360 }: Props = $props();

  const parsedData = $derived.by(() =>
    data
      .map(item => ({
        date: new Date(`${item.date}T12:00:00`),
        detectionCount: item.detectionCount,
        activeSpeciesCount: item.activeSpeciesCount,
      }))
      .filter(item => !Number.isNaN(item.date.getTime()))
  );

  let chartContainer = $state<HTMLDivElement | null>(null);
  let chartContext = $state<{
    svg: Selection<SVGSVGElement, unknown, null, undefined>;
    chartGroup: Selection<globalThis.SVGGElement, unknown, null, undefined>;
    innerWidth: number;
    innerHeight: number;
    theme: ChartTheme;
  } | null>(null);
  let tooltip: ChartTooltip | null = null;

  function drawChart(context: {
    chartGroup: Selection<globalThis.SVGGElement, unknown, null, undefined>;
    innerWidth: number;
    innerHeight: number;
    theme: ChartTheme;
  }) {
    const { chartGroup, innerWidth, innerHeight, theme } = context;
    chartGroup.selectAll('*').remove();

    if (parsedData.length === 0) {
      return;
    }

    const dateExtent = extent(parsedData, item => item.date);
    if (!dateExtent[0] || !dateExtent[1]) {
      return;
    }

    const maxDetections = Math.max(1, max(parsedData, item => item.detectionCount) ?? 0);
    const maxActiveSpecies = Math.max(1, max(parsedData, item => item.activeSpeciesCount) ?? 0);

    const xScale = createTimeScale({
      domain: [dateExtent[0], dateExtent[1]],
      range: [0, innerWidth],
    });
    const detectionsScale = createLinearScale({
      domain: [0, maxDetections],
      range: [innerHeight, 0],
    });
    const activeSpeciesScale = createLinearScale({
      domain: [0, maxActiveSpecies],
      range: [innerHeight, 0],
    });

    createGridLines(
      chartGroup,
      {
        xScale,
        yScale: detectionsScale,
        width: innerWidth,
        height: innerHeight,
      },
      theme.axis
    );

    const dateTick = createDateAxisFormatter('month');
    chartGroup
      .append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(
        axisBottom(xScale)
          .ticks(Math.min(MAX_X_TICKS, Math.max(2, Math.floor(innerWidth / X_TICK_SPACING))))
          .tickFormat(value => dateTick(value as Date))
      )
      .call(group => {
        group.selectAll('.domain, .tick line').attr('stroke', theme.axis.color);
        group.selectAll('.tick text').attr('fill', theme.axis.color);
      });

    chartGroup
      .append('g')
      .call(axisLeft(detectionsScale).ticks(Y_TICK_COUNT))
      .call(group => {
        group.selectAll('.domain, .tick line').attr('stroke', theme.axis.color);
        group.selectAll('.tick text').attr('fill', theme.axis.color);
      });

    chartGroup
      .append('g')
      .attr('transform', `translate(${innerWidth},0)`)
      .call(axisRight(activeSpeciesScale).ticks(Y_TICK_COUNT))
      .call(group => {
        group.selectAll('.domain, .tick line').attr('stroke', theme.axis.color);
        group.selectAll('.tick text').attr('fill', theme.axis.color);
      });

    addAxisLabel(
      chartGroup,
      {
        text: t('analytics.birdMigration.charts.activity.axisDate'),
        orientation: 'bottom',
        offset: X_AXIS_LABEL_OFFSET,
        width: innerWidth,
        height: innerHeight,
      },
      theme.axis
    );
    addAxisLabel(
      chartGroup,
      {
        text: t('analytics.birdMigration.charts.activity.axisDetections'),
        orientation: 'left',
        offset: LEFT_AXIS_LABEL_OFFSET,
        width: innerWidth,
        height: innerHeight,
      },
      theme.axis
    );
    addAxisLabel(
      chartGroup,
      {
        text: t('analytics.birdMigration.charts.activity.axisActiveSpecies'),
        orientation: 'right',
        offset: RIGHT_AXIS_LABEL_OFFSET,
        width: innerWidth,
        height: innerHeight,
      },
      theme.axis
    );

    const dayWidth = parsedData.length > 0 ? Math.max(innerWidth / parsedData.length - 3, 6) : 6;
    chartGroup
      .append('g')
      .selectAll('rect')
      .data(parsedData)
      .enter()
      .append('rect')
      .attr('x', item => xScale(item.date) - dayWidth / 2)
      .attr('y', item => detectionsScale(item.detectionCount))
      .attr('width', dayWidth)
      .attr('height', item => innerHeight - detectionsScale(item.detectionCount))
      .attr('fill', theme.primary)
      .attr('opacity', BAR_OPACITY);

    const lineGenerator = line<ActivityDatum>()
      .x(item => xScale(item.date))
      .y(item => activeSpeciesScale(item.activeSpeciesCount))
      .curve(curveMonotoneX);

    chartGroup
      .append('path')
      .datum(parsedData)
      .attr('fill', 'none')
      .attr('stroke', theme.success)
      .attr('stroke-width', LINE_STROKE_WIDTH)
      .attr('d', lineGenerator);

    chartGroup
      .append('g')
      .selectAll('circle')
      .data(parsedData)
      .enter()
      .append('circle')
      .attr('cx', item => xScale(item.date))
      .attr('cy', item => activeSpeciesScale(item.activeSpeciesCount))
      .attr('r', POINT_RADIUS)
      .attr('fill', theme.success)
      .on('mouseenter', function (event: MouseEvent, item: ActivityDatum) {
        select(this).attr('r', POINT_HOVER_RADIUS);
        tooltip?.show({
          title: t('analytics.birdMigration.charts.activity.title'),
          items: [
            {
              label: t('analytics.birdMigration.tables.columns.date'),
              value: getLocalDateString(item.date),
            },
            {
              label: t('analytics.birdMigration.charts.activity.detections'),
              value: item.detectionCount,
              color: theme.primary,
            },
            {
              label: t('analytics.birdMigration.charts.activity.activeSpecies'),
              value: item.activeSpeciesCount,
              color: theme.success,
            },
          ],
          x: event.clientX,
          y: event.clientY,
        });
      })
      .on('mouseleave', function () {
        select(this).attr('r', POINT_RADIUS);
        tooltip?.hide();
      });
  }

  $effect(() => {
    if (chartContext) {
      drawChart(chartContext);
    }
  });

  onMount(() => {
    if (chartContainer) {
      tooltip = new ChartTooltip(chartContainer);
    }
  });

  onDestroy(() => {
    tooltip?.destroy();
  });
</script>

<div class="bird-migration-activity-chart h-full min-h-80" bind:this={chartContainer}>
  <BaseChart
    {width}
    {height}
    responsive={true}
    margin={{ top: 18, right: 68, bottom: 64, left: 62 }}
  >
    {#snippet children(context)}
      {((chartContext = context), '')}
    {/snippet}
  </BaseChart>
</div>
