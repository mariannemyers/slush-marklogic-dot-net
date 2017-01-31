using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace slush_marklogic_dotnet_appserver.Controllers
{
    [Route("v1/{*url}")]
    public class SearchController : Controller
    {

        IOptions<MarkLogicOptions> _settings;

        public SearchController(IOptions<MarkLogicOptions> settings) {
            _settings = settings;
        }

        [HttpGet]
        public async Task GetAsync() {
          await Invoke();
        }

        [HttpPost]
        public async Task PostAsync()
        {
            await Invoke();
        }

        [HttpPut]
        public async Task PutAsync()
        {
            await Invoke();
        }

        [HttpDelete]
        public async Task DeleteAsync([FromBody] dynamic jsonBody)
        {
            await Invoke();
        }

        public async Task Invoke()
        {
            var requestMessage = new HttpRequestMessage();
            var requestMethod = HttpContext.Request.Method;
            if (!HttpMethods.IsGet(requestMethod)&&
                !HttpMethods.IsHead(requestMethod) &&
                !HttpMethods.IsDelete(requestMethod)&&
                !HttpMethods.IsTrace(requestMethod))
            {
                var ms = new MemoryStream();
                HttpContext.Request.Body.CopyTo(ms);
                var streamContent = new StreamContent(new MemoryStream(ms.ToArray()));
                requestMessage.Content = streamContent;
            }

            // Copy the request headers
            foreach (var header in HttpContext.Request.Headers)
            {
                if (!requestMessage.Headers.TryAddWithoutValidation(header.Key, header.Value.ToArray()) && requestMessage.Content != null)
                {
                    requestMessage.Content?.Headers.TryAddWithoutValidation(header.Key, header.Value.ToArray());
                }
            }

            requestMessage.Headers.Host = _settings.Value.Host + ":" + _settings.Value.AppPort;
            var uriString = $"http://{_settings.Value.Host}:{_settings.Value.AppPort}{HttpContext.Request.PathBase}{HttpContext.Request.Path}{HttpContext.Request.QueryString}";
            requestMessage.RequestUri = new Uri(uriString);
            requestMessage.Method = new HttpMethod(HttpContext.Request.Method);
            var credentials = HttpContext.Session.GetObjectFromJson<NetworkCredential>("credentials");
            var handler = new HttpClientHandler { Credentials = credentials };
            var client = new HttpClient(handler);
            
            using (var responseMessage = await client.SendAsync(requestMessage, HttpCompletionOption.ResponseHeadersRead, HttpContext.RequestAborted))
            {
                HttpContext.Response.StatusCode = (int)responseMessage.StatusCode;
                foreach (var header in responseMessage.Headers)
                {
                    HttpContext.Response.Headers[header.Key] = header.Value.ToArray();
                }

                foreach (var header in responseMessage.Content.Headers)
                {
                    HttpContext.Response.Headers[header.Key] = header.Value.ToArray();
                }

                // SendAsync removes chunking from the response. This removes the header so it doesn't expect a chunked response.
                HttpContext.Response.Headers.Remove("transfer-encoding");
                await responseMessage.Content.CopyToAsync(HttpContext.Response.Body);
            }
        }

    }
}
