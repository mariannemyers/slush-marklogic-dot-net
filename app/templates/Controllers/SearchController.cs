using System;
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
        public IActionResult Get() {
         return Json("get");
        }

        [HttpPost]
        public IActionResult Post([FromBody] dynamic jsonBody) {
         return Json(jsonBody);
        }

        [HttpPut]
        public IActionResult Put([FromBody] dynamic jsonBody) {
         return Json(jsonBody);
        }

        [HttpDelete]
        public IActionResult Delete([FromBody] dynamic jsonBody) {
         return Json(jsonBody);
        }

    }
}
