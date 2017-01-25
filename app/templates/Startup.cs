using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;

namespace slush_marklogic_dotnet_appserver
{
    public class Startup
    {
        public IConfigurationRoot Configuration { get; set; }

        public Startup(IHostingEnvironment env)
        {
            // Set up configuration sources.
            var builder = new ConfigurationBuilder()
                .SetBasePath(env.ContentRootPath)
                .AddJsonFile("appsettings.json")
                .AddEnvironmentVariables();
            Configuration = builder.Build();
        }

        // This method gets called by the runtime. Use this method to add services to the container.
        // For more information on how to configure your application, visit http://go.microsoft.com/fwlink/?LinkID=398940
        public void ConfigureServices(IServiceCollection services)
        {
            // Map the #SpaSettings section to the <see cref=SpaSettings /> class
            services.Configure<SpaSettings>(Configuration.GetSection("SpaSettings"));
            services.AddMvc();
            services.AddDistributedMemoryCache();
            services.AddSession();
            services.AddOptions();
            services.Configure<MarkLogicOptions>(Configuration.GetSection("MarkLogic"));
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IHostingEnvironment env, ILoggerFactory loggerFactory, IOptions<SpaSettings> spaSettings)
        {
            loggerFactory.AddConsole(LogLevel.Debug);

            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }

            // UseSession must come before UseMvc
            app.UseSession();
            app.UseMvc();

            app.UseDefaultFiles();
            app.UseStaticFiles();
            
            ConfigureRoutes(app, spaSettings.Value);


            Console.WriteLine("MarkLogic App Server: " + Configuration["MarkLogic:Host"] + 
                " on port " + Configuration["MarkLogic:AppPort"]);
        }

        private void ConfigureRoutes(IApplicationBuilder app, SpaSettings spaSettings)
        {          
            app.MapWhen(IsMarkLogicPath, builder => builder.RunProxy(new ProxyOptions
            {
                Scheme = "http",
                Host = Configuration["MarkLogic:Host"],
                Port = Configuration["MarkLogic:AppPort"]
            }));

            // If the route contains '.' (i.e. a js file) then assume a file to 
            // be served and try to serve using StaticFiles
            // if the route is spa (Angular) route then let it fall through to the
            // spa index file and have it resolved by the spa application
            
            app.MapWhen(context => {
                var path = context.Request.Path.Value;
                return !path.Contains(".");
            },
            spa => {
                spa.Use((context, next) =>
                {
                    context.Request.Path = new PathString("/" + spaSettings.DefaultPage);
                    return next();
                });

                spa.UseStaticFiles();
            });
        }

        private static bool IsMarkLogicPath(HttpContext httpContext)
        {
            return httpContext.Request.Path.Value.StartsWith(@"/v1/", StringComparison.OrdinalIgnoreCase);
        }
    }
}

