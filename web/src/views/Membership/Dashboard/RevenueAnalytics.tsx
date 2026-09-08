import { useEffect, useRef } from 'react';

const FloatChart = () => {
    const chartRef = useRef(null);

    useEffect(() => {
        const options = {
            chart: {
                type: 'area',
                height: 300,
                toolbar: {
                  show: false
                }
            },
            colors: ['#f4c22b', '#04a9f5'],
            dataLabels: {
                enabled: false
            },
            legend: {
                show: true,
                position: 'top'
            },
            markers: {
                size: 1,
                colors: ['#fff', '#fff', '#fff'],
                strokeColors: ['#f4c22b', '#04a9f5'],
                strokeWidth: 1,
                shape: 'circle',
                hover: {
                    size: 4
                }
            },
            stroke: {
                width: 1,
                curve: 'smooth'
            },
            fill: {
                type: 'gradient',
                gradient: {
                    shadeIntensity: 1,
                    type: 'vertical',
                    inverseColors: false,
                    opacityFrom: 0.5,
                    opacityTo: 0
                }
            },
            grid: {
                show: false,
            },
            series: [
                {
                    name: 'Revenue',
                    data: [200, 320, 320, 275, 275, 400, 400, 300, 440, 320, 320, 275, 275, 400, 300, 440]
                },
                {
                    name: 'Sales',
                    data: [200, 250, 240, 300, 340, 320, 320, 400, 350, 250, 240, 300, 340, 320, 400, 350]
                }
            ],
            xaxis: {
                labels: {
                    hideOverlappingLabels: true
                },
                axisBorder: {
                    show: false
                },
                axisTicks: {
                    show: false
                }
            }
        };

        if (chartRef.current) {
            const chart = new ApexCharts(chartRef.current, options);
            chart.render();
        }

        return () => {
            if (chartRef.current) { 
            }
        };
    }, []);

    return <div ref={chartRef} />;
};

export default FloatChart;
