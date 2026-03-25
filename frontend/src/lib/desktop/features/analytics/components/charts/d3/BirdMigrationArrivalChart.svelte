<script lang="ts">
  import { extent, max } from 'd3-array';
  import { axisBottom, axisLeft } from 'd3-axis';
  import { select, type Selection } from 'd3-selection';
  import { area, curveMonotoneX, line } from 'd3-shape';
  import { onDestroy, onMount } from 'svelte';

  import BaseChart from './BaseChart.svelte';
  import { createGridLines, createDateAxisFormatter, addAxisLabel } from './utils/axes';
  import { ChartTooltip } from './utils/interactions';
  import { createLinearScale, createTimeScale } from './utils/scales';
  import type { ChartTheme } from './utils/theme';
  import { t } from '$lib/i18n';
  import { getLocalDateString } from '$lib/utils/date';
  import type { BirdMigrationArrivalDatum } from '../../../utils/birdMigrationTypes';

  interface ArrivalDatum {
    date: Date;
    newSpeciesCount: number;
    cumulativeSpeciesCount: number;
  }

  interface Props {
    data: BirdMigrationArrivalDatum[];
    width?: number;
    height?: number;
  }

  const AREA_OPACITY = 0.14;
  const BAR_OPACITY = 0.2;
  const LINE_STROKE_WIDTH = 2.5;
  const POINT_RADIUS = 3.5;
  const POINT_HOVER_RADIUS = 6;
  const MAX_X_TICKS = 8;
  const X_TICK_SPACING = 80;
  const Y_TICK_COUNT = 5;
  const X_AXIS_LABEL_OFFSET = 38;
  const Y_AXIS_LABEL_OFFSET = 44;

  let { data = [], width = 800, height = 360 }: Props = $props();

  const parsedData = $derived.by(() =>
    data
      .map(item => ({
        date: new Date(`${item.date}T12:00:00`),
        newSpeciesCount: item.newSpeciesCount,
        cumulativeSpeciesCount: item.cumulativeSpeciesCount,
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

    const maxCumulative = max(parsedData, item => item.cumulativeSpeciesCount) ?? 0;
    const xScale = createTimeScale({
      domain: [dateExtent[0], dateExtent[1]],
      range: [0, innerWidth],
    });
    const yScale = createLinearScale({
      domain: [0, Math.max(1, maxCumulative)],
      range: [innerHeight, 0],
    });

    createGridLines(
      chartGroup,
      {
        xScale,
        yScale,
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
      .call(axisLeft(yScale).ticks(Y_TICK_COUNT))
      .call(group => {
        group.selectAll('.domain, .tick line').attr('stroke', theme.axis.color);
        group.selectAll('.tick text').attr('fill', theme.axis.color);
      });

    addAxisLabel(
      chartGroup,
      {
        text: t('analytics.birdMigration.charts.arrivals.axisDate'),
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
        text: t('analytics.birdMigration.charts.arrivals.axisCumulativeSpecies'),
        orientation: 'left',
        offset: Y_AXIS_LABEL_OFFSET,
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
      .attr('y', item => yScale(item.newSpeciesCount))
      .attr('width', dayWidth)
      .attr('height', item => innerHeight - yScale(item.newSpeciesCount))
      .attr('fill', theme.secondary)
      .attr('opacity', BAR_OPACITY);

    const areaGenerator = area<ArrivalDatum>()
      .x(item => xScale(item.date))
      .y0(innerHeight)
      .y1(item => yScale(item.cumulativeSpeciesCount))
      .curve(curveMonotoneX);

    const lineGenerator = line<ArrivalDatum>()
      .x(item => xScale(item.date))
      .y(item => yScale(item.cumulativeSpeciesCount))
      .curve(curveMonotoneX);

    chartGroup
      .append('path')
      .datum(parsedData)
      .attr('fill', theme.primary)
      .attr('opacity', AREA_OPACITY)
      .attr('d', areaGenerator);

    chartGroup
      .append('path')
      .datum(parsedData)
      .attr('fill', 'none')
      .attr('stroke', theme.primary)
      .attr('stroke-width', LINE_STROKE_WIDTH)
      .attr('d', lineGenerator);

    chartGroup
      .append('g')
      .selectAll('circle')
      .data(parsedData)
      .enter()
      .append('circle')
      .attr('cx', item => xScale(item.date))
      .attr('cy', item => yScale(item.cumulativeSpeciesCount))
      .attr('r', POINT_RADIUS)
      .attr('fill', theme.primary)
      .on('mouseenter', function (event: MouseEvent, item: ArrivalDatum) {
        select(this).attr('r', POINT_HOVER_RADIUS);
        tooltip?.show({
          title: t('analytics.birdMigration.charts.arrivals.title'),
          items: [
            {
              label: t('analytics.birdMigration.tables.columns.date'),
              value: getLocalDateString(item.date),
            },
            {
              label: t('analytics.birdMigration.charts.arrivals.newSpecies'),
              value: item.newSpeciesCount,
            },
            {
              label: t('analytics.birdMigration.charts.arrivals.cumulativeSpecies'),
              value: item.cumulativeSpeciesCount,
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

<div class="bird-migration-arrival-chart h-full min-h-80" bind:this={chartContainer}>
  <BaseChart
    {width}
    {height}
    responsive={true}
    margin={{ top: 18, right: 20, bottom: 64, left: 60 }}
  >
    {#snippet children(context)}
      {((chartContext = context), '')}
    {/snippet}
  </BaseChart>
</div>
