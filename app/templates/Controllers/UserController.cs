using System;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Http;
using System.Net;
using System.Net.Http;
using Microsoft.Extensions.Options;
using System.Net.Http.Headers;
using Newtonsoft.Json.Linq;

namespace slush_marklogic_dotnet_appserver.Controllers
{
    [Route("api/[controller]")]
    public class UserController : Controller
    {

        IOptions<MarkLogicOptions> _settings;

        public UserController(IOptions<MarkLogicOptions> settings) {
            _settings = settings;
        }
        
        [HttpPost("[action]")]
        public UserViewModel Login([FromBody] UserViewModel user)
        {
            // Here you'll pass along the credentials like the node layer does
            // and set authenticated = true.  Store this information in the Session.
            user = GetUserProfile(user);
            HttpContext.Session.SetString("user.username", user.username);
            HttpContext.Session.SetString("user.password", user.password);
            HttpContext.Session.SetString("user.authenticated", user.authenticated.ToString().ToLowerInvariant());
            if (user.profile != null) {
                HttpContext.Session.SetString("user.profile", user.profile.ToString());
            }
            return user;
        }

        [HttpGet("[action]")]
        public void Logout()
        {
            // Here you'll log the user out.  Clear the Session data and return 
            // the proper data like node does.
            HttpContext.Session.Clear();
        }


        [HttpGet("[action]")]
        public UserViewModel Status()
        {
            // Do a similar status check here.  Grab it from the Session.
            UserViewModel model = new UserViewModel();
            model.authenticated = false;
            string auth = HttpContext.Session.GetString("user.authenticated");
            if(auth != null){
                if(auth.Equals("true")) {
                    model.username = HttpContext.Session.GetString("user.username");
                    string profile = HttpContext.Session.GetString("user.profile");
                    if (profile != null) {
                        model.profile = JObject.Parse(profile);
                    }
                    model.authenticated = true;
                }
            }

            return model;
        }

        private UserViewModel GetUserProfile(UserViewModel user) {
            var userSettingsUri = new Uri(
                "http://" 
                + _settings.Value.Host 
                + ":" 
                + _settings.Value.AppPort 
                + "/v1/documents?uri=/api/users/" 
                + user.username 
                + ".json"
            );
            var credentials = new NetworkCredential(user.username, user.password);
            var handler = new HttpClientHandler { Credentials = credentials };
            using (var http = new HttpClient(handler))
            {
                http.DefaultRequestHeaders.Accept.Clear();
                http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
                var response = http.GetAsync(userSettingsUri).Result;
                if (response.StatusCode == HttpStatusCode.OK) {
                    // good.  add the json settings
                    user.authenticated = true;
                    var profile = response.Content.ReadAsStringAsync().Result;
                    user.profile = JObject.Parse(profile)["user"];
                } else if (response.StatusCode == HttpStatusCode.NotFound) {
                    // password OK.  No settings.
                    user.authenticated = true;
                } else {
                    user.authenticated = false;
                }
            }
            return user;
        }
    }
}
