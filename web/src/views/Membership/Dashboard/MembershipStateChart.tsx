import { useEffect, useRef } from 'react';
import ApexCharts from 'apexcharts';

const MembershipStateChart = () => {
    const chartRef = useRef(null);

    useEffect(() => {
        const membershipStateChartOption = {
            series: [76],
            chart: {
                type: 'radialBar',
                offsetY: -20,
                sparkline: {
                    enabled: true
                }
            },
            colors: ['#04a9f5'],
            plotOptions: {
                radialBar: {
                    startAngle: -95,
                    endAngle: 95,
                    hollow: {
                        margin: 15,
                        size: '40%',
                    },
                    track: {
                        background: '#04a9f525',
                        strokeWidth: '97%',
                        margin: 10
                    },
                    dataLabels: {
                        name: {
                            show: false
                        },
                        value: {
                            offsetY: 0,
                            fontSize: '20px'
                        }
                    }
                }
            },
            grid: {
                padding: {
                    top: 10
                }
            },
            stroke: {
                lineCap: 'round'
            },
            labels: ['Average Results']
        };

        const chart = new ApexCharts(chartRef.current, membershipStateChartOption);
        chart.render();

        return () => {
            chart.destroy();
        };
    }, []);

    return <div ref={chartRef} />;
};

export default MembershipStateChart;
